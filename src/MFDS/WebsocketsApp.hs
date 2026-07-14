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
import Text.Megaparsec.Char (space)
import Text.Megaparsec.Char.Lexer (decimal, signed)

data ServerState = ServerState
  { clients :: Map CallSign WS.Connection
  , messages :: [Message]
  }

initialState :: ServerState
initialState = ServerState (Map.empty) []

newtype CallSign = CallSign {fromCallSign :: Int}
  deriving (Eq, Ord)

instance Show CallSign where show = Text.unpack . renderCallSign'

data Message = Message
  { author :: CallSign
  , content :: [Int]
  }

data RecvMessage
  = SetCallSign CallSign
  | Say [Int]
  | Noop
  deriving (Show)

data SendMessage
  = Msg Message
  | CallSignOK CallSign
  | CallSignInUse CallSign
  | AllClients [CallSign]

renderCallSign :: CallSign -> Text
renderCallSign = Text.pack . show . fromCallSign

renderCallSign' :: CallSign -> Text
renderCallSign' = Text.justifyRight 4 '0' . renderCallSign

runWebsocketServer :: IO ()
runWebsocketServer = do
  state <- newMVar initialState
  WS.runServer "127.0.0.1" 9160 $ runChat state

runChat :: MVar ServerState -> WS.ServerApp
runChat state pending = do
  conn <- WS.acceptRequest pending

  WS.withPingThread conn 30 mempty $
    do
      myCallSign <- newMVar $ CallSign $ -1
      let
        getCallSign = flip (withMessage conn) myCallSign \case
          SetCallSign cs -> do
            didSetCallSign <- setCallSign cs myCallSign conn
            if didSetCallSign
              then writeMVar myCallSign cs >> pure ()
              else getCallSign
          _ -> getCallSign

      -- Loop until a fresh callsign is received
      getCallSign

      -- Send the last 10 messages
      sendHistory conn

      flip finally (disconnect myCallSign) $
        forever $
          flip (withMessage conn) myCallSign \case
            SetCallSign cs -> do
              didSetCallSign <- setCallSign cs myCallSign conn
              when didSetCallSign $ writeMVar myCallSign cs
            Say content -> do
              cs <- readMVar myCallSign
              handleMessage content cs
            Noop -> pure ()
 where
  withMessage :: WS.Connection -> (RecvMessage -> IO ()) -> MVar CallSign -> IO ()
  withMessage conn a mcs = do
    m <- fmap parseMsg (WS.receiveData conn)
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
    remClient cs
    broadcastClients

  parseMsg :: Text -> Either String RecvMessage
  parseMsg msg = first errorBundlePretty $ parse p "" msg
   where
    p, pcs, pmsg :: Parsec Void Text RecvMessage
    p = pcs <|> pmsg
    pcs = fmap (SetCallSign . CallSign) $ "S," *> decimal
    pmsg = fmap Say $ "M," *> (signed space decimal `sepBy` ",")

  renderMsg :: SendMessage -> Text
  renderMsg = \case
    Msg (Message{author, content}) ->
      mconcat . List.intersperse "," $
        ["R", renderCallSign author] <> (map (Text.pack . show) content)
    CallSignOK n -> "K," <> renderCallSign n
    CallSignInUse n -> "U," <> renderCallSign n
    AllClients clients -> "C," <> mconcat (List.intersperse "," $ map renderCallSign clients)

  handleMessage :: [Int] -> CallSign -> IO ()
  handleMessage content cs = do
    let m = Msg (Message cs content)
    Text.putStrLn $ renderMsg m
    ServerState{clients} <- readMVar state
    forM_ clients $ send m
    modifyMVar_ state $ \s@ServerState{messages} -> pure s{messages = Message cs content : take 9 messages}

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