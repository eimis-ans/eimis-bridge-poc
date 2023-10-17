/*
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {AppServiceRegistration, Cli, Logger} from 'matrix-appservice-bridge';
import path from "path";
import {IConfig} from "./IConfig";
import {Main} from "./Main";

const DEFAULT_PORT = 5858;

Logger.configure({console: "debug"});
const log = new Logger("index");

// let bridge: Bridge;
//
// const http = require("node:http");
// const qs = require("node:querystring"); // we will use this later

const cli = new Cli({
    bridgeConfig: {
        defaults: {},
        affectsRegistration: false,
        schema: path.join(__dirname, "../config/bridge-config-schema.yaml"),
    },
    registrationPath: "eimis-registration.yaml",
    generateRegistration: function (reg, callback) {
        log.info("generate token")
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart("bridgebot");
        reg.addRegexPattern("users", "@*.*", true);
        reg.addRegexPattern('aliases', '#_bridge_.*', false);
        callback(reg);
    },
    run: function (cliPort: number | null, rawConfig: Record<string, undefined> | null, registration) {
        // @ts-ignore
        const config = rawConfig as IConfig | null;
        if (!config) {
            throw Error('Config not ready');
        }
        // let user = new MatrixUser("firstUser");
        const main = new Main(config, registration);
        main.run(cliPort || config.homeserver.appservice_port || DEFAULT_PORT).then((port) => {
            log.info("Matrix-side listening on port", port);
        }).catch((ex) => {
            log.error("Failed to start:", ex);
            process.exit(1);
        });
    }
});
cli.run();
