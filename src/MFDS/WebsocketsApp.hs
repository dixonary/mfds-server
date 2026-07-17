{-# LANGUAGE OverloadedStrings #-}

module MFDS.WebsocketsApp where

import Control.Concurrent
import Control.Monad

import Data.Text (Text)
import Data.Text qualified as Text
import Data.Text.IO qualified as Text
import Text.Megaparsec

import Data.Map (Map)

import Control.Exception (finally)
import Data.Bifunctor
import Data.List qualified as List
import Data.Map qualified as Map
import Data.Void
import Network.WebSockets qualified as WS
import System.Environment
import Text.Megaparsec.Char (space)
import Text.Megaparsec.Char.Lexer (decimal, signed)

data ServerState = ServerState
  { clients :: Map CallSign WS.Connection
  , messages :: [Message]
  , nextMessageNumber :: Int
  }

initialState :: ServerState
initialState = ServerState (Map.empty) [] 0

newtype CallSign = CallSign {fromCallSign :: Int}
  deriving (Eq, Ord)

instance Show CallSign where show = Text.unpack . renderCallSign'

data Message = Message
  { author :: CallSign
  , messageNumber :: Int
  , content :: [Int]
  }

data RecvMessage
  = SetCallSign CallSign Bool
  | Say [Int]
  | Noop
  deriving (Show)

data SendMessage
  = Msg Message
  | CallSignOK CallSign
  | CallSignInUse CallSign
  | ReconnectOK
  | AllClients [CallSign]

renderCallSign :: CallSign -> Text
renderCallSign = Text.pack . show . fromCallSign

renderCallSign' :: CallSign -> Text
renderCallSign' = Text.justifyRight 4 '0' . renderCallSign

runWebsocketServer :: IO ()
runWebsocketServer = do
  port <- read @Int <$> getEnv "WEBSOCKET_SERVER_PORT"
  state <- newMVar initialState
  WS.runServer "127.0.0.1" port $ runChat state

runChat :: MVar ServerState -> WS.ServerApp
runChat state pending = do
  conn <- WS.acceptRequest pending

  WS.withPingThread conn 30 mempty $
    do
      myCallSign <- newMVar $ CallSign $ -1
      flip finally (disconnect myCallSign) $ do
        let
          getCallSign :: IO Bool
          getCallSign = flip (withMessage conn) myCallSign \case
            SetCallSign cs True -> do
              forceCallSign cs conn
              writeMVar myCallSign cs
              pure True
            SetCallSign cs False -> do
              didSetCallSign <- setCallSign cs myCallSign conn
              if didSetCallSign
                then writeMVar myCallSign cs >> pure False
                else getCallSign
            _ -> getCallSign

        -- Loop until a fresh callsign is received, or until the
        -- user has told us they were making a reconnect attempt
        isReconnect <- getCallSign

        -- Send the last 10 messages, or a notice that the
        -- reconnection was successful
        if isReconnect
          then send ReconnectOK conn
          else sendHistory conn

        forever $ flip (withMessage conn) myCallSign \case
          -- Reconnects get no special treatment
          SetCallSign cs _ -> do
            didSetCallSign <- setCallSign cs myCallSign conn
            when didSetCallSign $ writeMVar myCallSign cs
          Say content -> do
            cs <- readMVar myCallSign
            handleMessage content cs
          Noop -> pure ()
 where
  withMessage :: WS.Connection -> (RecvMessage -> IO a) -> MVar CallSign -> IO a
  withMessage conn a mcs = do
    m <- fmap parseMsg (WS.receiveData conn)
    print m
    case m of
      Left err -> do
        putStrLn "======"
        putStr "Could not parse message from client "
        cs <- readMVar mcs
        Text.putStrLn $ renderCallSign' cs
        putStrLn err
        putStrLn "======"
        a Noop
      Right m' -> do
        putStrLn $ show m'
        a m'

  -- Forcibly write the call sign without regard for what was there before.
  -- This should only be received during a reconnection attempt.
  -- It is likely to cause issues if someone tries to reconnect who was not previously/recently connected.
  forceCallSign :: CallSign -> WS.Connection -> IO ()
  forceCallSign callSign conn = modifyMVar_ state $ \s ->
    pure
      s
        { clients = Map.insert callSign conn $ clients s
        }

  setCallSign :: CallSign -> MVar CallSign -> WS.Connection -> IO Bool
  setCallSign callSign mcs conn = do
    oldCS <- readMVar mcs
    if (oldCS == callSign)
      then send (CallSignOK callSign) conn >> pure False
      else do
        didSetCallSign <- modifyMVar state $
          \s@ServerState{clients} -> do
            case Map.lookup callSign clients of
              Just _ -> do
                send (CallSignInUse callSign) conn
                pure (s, False)
              _ -> do
                send (CallSignOK callSign) conn
                let c' = Map.insert callSign conn $ Map.delete oldCS clients
                pure (s{clients = c'}, True)
        when didSetCallSign broadcastClients
        pure didSetCallSign

  remClient :: CallSign -> IO ()
  remClient cs = do
    modifyMVar_ state $
      \s@ServerState{clients} ->
        pure s{clients = Map.delete cs clients}

  disconnect :: MVar CallSign -> IO ()
  disconnect mcs = do
    cs <- readMVar mcs
    putStrLn $ "Disconnecting client " ++ Text.unpack (renderCallSign cs)
    remClient cs
    broadcastClients

  parseMsg :: Text -> Either String RecvMessage
  parseMsg msg = first errorBundlePretty $ parse p "" msg
   where
    p, rcs, pcs, pmsg :: Parsec Void Text RecvMessage
    p = (pcs <|> rcs <|> pmsg) <* eof
    -- Reconnect message S,1234,0
    rcs = fmap (\x -> SetCallSign (CallSign x) True) $ "S," *> decimal <* ",0"
    -- Standard join message S,1234
    pcs = fmap (\x -> SetCallSign (CallSign x) False) $ "S," *> decimal
    pmsg = fmap Say $ "M," *> (signed space decimal `sepBy` ",")

  renderMsg :: SendMessage -> Text
  renderMsg = \case
    Msg (Message{author, messageNumber, content}) ->
      mconcat . List.intersperse "," $
        ["R", renderCallSign author, Text.pack $ show messageNumber]
          <> (map (Text.pack . show) content)
    CallSignOK n -> "K," <> renderCallSign n
    ReconnectOK -> "E"
    CallSignInUse n -> "U," <> renderCallSign n
    AllClients clients -> "C," <> mconcat (List.intersperse "," $ map renderCallSign clients)

  handleMessage :: [Int] -> CallSign -> IO ()
  handleMessage content cs = do
    mn <- modifyMVar state $ \s@ServerState{nextMessageNumber} -> do
      pure
        ( s{nextMessageNumber = (nextMessageNumber + 1) `mod` 512}
        , nextMessageNumber
        )

    let m = (Message cs mn content)
    Text.putStrLn $ renderMsg $ Msg m
    ServerState{clients} <- readMVar state
    forM_ clients $ send $ Msg m
    modifyMVar_ state $ \s@ServerState{messages} -> pure s{messages = m : take 9 messages}

  sendHistory :: WS.Connection -> IO ()
  sendHistory conn = do
    ServerState{messages} <- readMVar state
    forM_ (reverse messages) $ \msg -> do
      send (Msg msg) conn

  broadcastClients :: IO ()
  broadcastClients = do
    ServerState{clients} <- readMVar state
    forM_ clients $ send (AllClients $ Map.keys clients)

  send :: SendMessage -> WS.Connection -> IO ()
  send msg conn = WS.sendTextData conn (renderMsg msg)

----------
-- Helpers

writeMVar :: MVar a -> a -> IO ()
writeMVar mv val = void $ swapMVar mv val