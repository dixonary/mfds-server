{-# LANGUAGE OverloadedStrings #-}

module MFDS.WebApp where

import Network.Wai qualified as Wai
import Network.Wai.Application.Static
import Network.Wai.Handler.Warp

runWebServer :: IO ()
runWebServer = do
  runSettings
    (setHost "127.0.0.1" $ setPort 3000 defaultSettings)
    webApp

webApp :: Wai.Application
webApp = staticApp $ defaultFileServerSettings "public"