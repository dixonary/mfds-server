module MFDS.Main where

import Control.Concurrent (forkIO, threadDelay)
import Control.Monad (forever)

import MFDS.WebApp (runWebServer)
import MFDS.WebsocketsApp (runWebsocketServer)

main :: IO ()
main = do
  _ <- forkIO $ runWebsocketServer
  _ <- forkIO $ runWebServer

  putStrLn "Both servers are now running."

  forever $ threadDelay 1_000_000