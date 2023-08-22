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

import { AppServiceRegistration, Bridge, Cli, Logger } from 'matrix-appservice-bridge';

Logger.configure({ console: "debug" });
const log = new Logger("index");

let bridge: Bridge;

new Cli({
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
    run: function (port) {
        bridge = new Bridge({
            homeserverUrl: "http://matrix.local:8008",
            domain: "matrix.local",
            registration: "./synapse/mx-conf/eimis-registration.yaml",
            queue: { type: "none"},
            // disableContext: true,
            suppressEcho: true,
            controller: {
                onUserQuery: function (queriedUser) {
                    console.log("onUserQuery " + queriedUser);
                    return {}; // auto-provision users with no additonal data
                },

                onEphemeralEvent: function(request){
                    log.info("onEphemeralEvent : "+ request.getData());    
                },

                onAliasQuery: function(alias: string, aliasLocalpart: string){
                    log.info("onAliasQuery : "+ alias);
                },

                // onLog: function(text, isError){
                //     console.log("onLog rien sur? " + text);
                // },

                onEvent: function(request, context) {
                    const event = request.getData();
                    log.info(event);
                    log.info(context);
                    try{
                        // of course this fails if eimis_firstUser is not in the room
                        if (event.type === "m.room.message" && event.sender !== '@eimis_firstUser:matrix.local') {
                            const intent = bridge.getIntent("@eimis_firstUser:matrix.local");
                            intent.ensureProfile("first user");
                            intent.sendText(event.room_id, "Ta gueule");
                            return;
                        }else if(event.type === 'm.room.encrypted'){
                            const intent = bridge.getIntent("@eimis_firstUser:matrix.local");
                            intent.sendText(event.room_id, "What??");
                        }
                        else if(event.type === 'm.room.member'){
                            const intent = bridge.getIntent(event.state_key);
                            // intent.ensureProfile("first user");
                            intent.sendText(event.room_id, "Thanks for the invite!");
                        }
                    }catch(e){
                        log.error(e);
                    }
                }
            },

        });
        log.info("Matrix-side listening on port ", port);
        // bridge.run(port);
        // let user = new MatrixUser("firstUser");
        myStart(bridge, port)
    }
}).run();


async function myStart(bridge: Bridge, port: number){
    await bridge.initialise();
    bridge.listen(port);
    //// create a ghost user
    // const intent = bridge.getIntent("@eimis_user3:matrix.local");
    // intent.ensureProfile("eimis_user3");

    //// send message in existing room
    // const intent = bridge.getIntent("@eimis_firstUser:matrix.local");
    // intent.ensureProfile("first user");
    // intent.sendText("!CaYHXgonlkSZvkKPur:matrix.local", "Hello room!");

    //// create public room and invite someone
    // const intent = bridge.getIntent("@eimis_User2:matrix.local");
    // intent.createRoom({
    //     createAsClient: true,
    //     options: {
    //         visibility: "public",
    //         name: "test",
    //         topic: "test",
    //         preset: "public_chat",
    //         invite: ["@root:matrix.local"]
    //     }
    // }).then((res) => {
    //     console.log("Room created, id :" + res);
    // });
}
