module MFDS.Main where

import Control.Concurrent (forkIO, threadDelay)
import Control.Monad (forever)

import MFDS.WebApp (runWebServer)
import MFDS.WebsocketsApp (runWebsocketServer)
import System.IO (BufferMode (..), hSetBuffering, stderr, stdout)

main :: IO ()
main = do
  hSetBuffering stdout NoBuffering
  hSetBuffering stderr NoBuffering

  _ <- forkIO $ runWebsocketServer
  _ <- forkIO $ runWebServer

  putStrLn "Both servers are now running."

  forever $ threadDelay 1_000_000