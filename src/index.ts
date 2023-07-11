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

// Usage:
// node index.js -r -u "http://localhost:9000" # remember to add the registration!
// node index.js -p 9000
import http from 'http';
import querystring from 'querystring';
import requestLib from 'request';

import { Cli, Bridge, AppServiceRegistration, Logger, MatrixUser } from 'matrix-appservice-bridge';

Logger.configure({ console: "info" });
const log = new Logger("index");

const PORT = 9898; // eimis needs to hit this port e.g. use "ngrok 9898"
const ROOM_ID = "!YiuxjYhPLIZGVVkFjT:localhost"; // this room must have join_rules: public
const SLACK_WEBHOOK_URL = "https://hooks.eimis.com/services/AAAA/BBBBB/CCCCC";
let bridge: Bridge;

http.createServer(function (request, response) {
    console.log(request.method + " " + request.url);

    let body = '';
    request.on('data', function (chunk) {
        body += chunk;
    });

    request.on("end", function () {
        const params = querystring.parse(body);
        if (params.user_id !== "USLACKBOT") {
            const intent = bridge.getIntent(`@eimis_${params.user_name}:localhost`);
            intent.sendText(ROOM_ID, Array.isArray(params.text) ? params.text.join(' ') : params.text);
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.write(JSON.stringify({}));
        response.end();
    });
}).listen(PORT);



new Cli({
    registrationPath: "eimis-registration.yaml",
    generateRegistration: function (reg, callback) {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart("emeistress");
        reg.addRegexPattern("users", "@eimis_.*", true);
        callback(reg);
    },
    run: function (port) {
        bridge = new Bridge({
            homeserverUrl: "http://matrix.local:8008",
            domain: "localhost",
            registration: "eimis-registration.yaml",

            controller: {
                onUserQuery: function (queriedUser) {
                    return {}; // auto-provision users with no additonal data
                },

                onEvent: function (request, context) {
                    const event = request.getData();
                    log.info("Event : "+ event);
                    if (event.type !== "m.room.message" || !event.content || event.room_id !== ROOM_ID) {
                        return;
                    }
                    requestLib({
                        method: "POST",
                        json: true,
                        uri: SLACK_WEBHOOK_URL,
                        body: {
                            username: event.sender,
                            text: event.content.body
                        }
                    }, function (err, res) {
                        if (err) {
                            console.log("HTTP Error: %s", err);
                        }
                        else {
                            console.log("HTTP %s", res.statusCode);
                        }
                    });
                }
            }
        });
        log.info("Matrix-side listening on port ", port);
        bridge.run(port);
        let user = new MatrixUser("firstUser");
    }
}).run();
