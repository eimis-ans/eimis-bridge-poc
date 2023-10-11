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

import {AppServiceRegistration, Bridge, Cli, Logger} from 'matrix-appservice-bridge';
import {IncomingMessage, ServerResponse} from "http";
import path from "path";
import {IConfig} from "./IConfig";
import {Main} from "./Main";

const DEFAULT_PORT = 5858;

Logger.configure({console: "debug"});
const log = new Logger("index");

let bridge: Bridge;

const http = require("node:http");
const qs = require("node:querystring"); // we will use this later
// const requestLib = require("request"); // we will use this later

http.createServer(function (request: IncomingMessage, response: ServerResponse) {
    log.info(request.method + " " + request.url);

    let body = "";
    request.on("data", function (chunk: string) {

        type SlackChallenge = { token: string; challenge: string; type: string; }

        // Validate this value with a custom type guard (extend to your needs)
        function isSlackChallenge(o: any): o is SlackChallenge {
            return "token" in o && "challenge" in o
        }

        const body_content = JSON.parse(chunk);
        log.info(body_content);
        if (isSlackChallenge(body_content)) {
            // do something with now correctly typed object
            body = body_content.challenge
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.write(body);
            response.end();
        } else {
            // error handling; invalid JSON format
            body += chunk;
        }
    });

    request.on("end", function () {
        log.info("body=" + body);
        const params = qs.parse(body);
        if (params.user_id !== "USLACKBOT") {
            // const intent = bridge.getIntent("@slack_" + params.user_name + ":matrix.local");
            const intent = bridge.getIntent("@eimis_admin:matrix.local");
            intent.sendText("!GJSCiQdFcpnmUmHfOL:matrix.local", "pouet and prout");
        }
        response.writeHead(200, {"Content-Type": "application/json"});
        response.write(JSON.stringify({}));
        response.end();

    });
}).listen(9090);  // replace me with your actual port number!

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
        reg.setSenderLocalpart("emeis_tress");
        reg.addRegexPattern("users", "@eimis_.*", true);
        reg.addRegexPattern('aliases', '#*.*', false);
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
