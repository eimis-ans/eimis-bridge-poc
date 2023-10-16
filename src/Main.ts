import {AppServiceRegistration, Bridge, Logger} from "matrix-appservice-bridge";
import {IConfig} from "./IConfig";
import {SlackHookHandler} from "./SlackHookHandler";

const log = new Logger("Main");
export class Main {
    private ready = false;
    private bridge: Bridge;
    // public readonly oauth2: OAuth2|null = null;
    private slackHookHandler?: SlackHookHandler;

    constructor(public readonly config: IConfig, registration: AppServiceRegistration) {
        this.bridge = new Bridge({
            controller: {
                onUserQuery: function (queriedUser) {
                    log.info("onUserQuery " + queriedUser);
                    return {}; // auto-provision users with no additonal data
                },

                onEphemeralEvent: function(request){
                    log.info("onEphemeralEvent : "+ request.getData());
                },

                onAliasQuery: function(alias: string){
                    log.info("onAliasQuery : "+ alias);
                },

                // onLog: function(text, isError){
                //     log.info("onLog rien sur? " + text);
                // },

                onEvent: (request, context) => {
                    const event = request.getData();
                    log.info(event);
                    log.info(context);
                    try{
                        // of course this fails if eimis_firstUser is not in the room
                        if (event.type === "m.room.message" && event.sender !== '@eimis_firstUser:matrix.local') {
                            // this.bridge => pose problème
                            const intent = this.bridge.getIntent("@eimis_firstUser:matrix.local");
                            intent.ensureProfile("first user");
                            intent.sendText(event.room_id, "Ta gueule");
                            return;
                        }else if(event.type === 'm.room.encrypted'){
                            const intent = this.bridge.getIntent("@eimis_firstUser:matrix.local");
                            intent.sendText(event.room_id, "What??");
                        }
                        else if(event.type === 'm.room.member'){
                            const intent = this.bridge.getIntent(event.state_key);
                            // intent.ensureProfile("first user");
                            intent.sendText(event.room_id, "Thanks for the invite!");
                        }
                    }catch(e){
                        log.error(e);
                    }
                }
            },
            // roomUpgradeOpts: {
            //     consumeEvent: true,
            //     migrateGhosts: true,
            //     onRoomMigrated: this.onRoomUpgrade.bind(this),
            //     migrateStoreEntries: false,
            // },
            domain: config.homeserver.server_name,
            homeserverUrl: config.homeserver.url,
            registration,
            // ...bridgeStores,
            disableContext: true,
            suppressEcho: true,
            // bridgeEncryption: config.encryption?.enabled ? {
            //     homeserverUrl: config.encryption.pantalaimon_url,
            //     store: this.datastore as PgDatastore,
            // } : undefined,
        });

        if (config.slack_hook_port) {
            this.enableHookHandler();
        }
    }



    /**
     * Starts the bridge.
     * @param cliPort A port to listen to provided by the user via a CLI option.
     * @returns The port the appservice listens to.
     */
    public async run(cliPort: number): Promise<number> {
        await this.bridge.initialise();
        if (this.slackHookHandler) {
            if (!this.config.slack_hook_port) {
                throw Error('config option slack_hook_port must be defined');
            }
            await this.slackHookHandler.startAndListen(this.config.slack_hook_port, this.config.tls);
        }
        await this.bridge.listen(cliPort);
        await this.pingBridge();
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
        //     log.info("Room created, id :" + res);
        // });

        log.info("Bridge initialised and listening on " + cliPort);
        this.ready = true;
        return cliPort;
    }

    private async pingBridge() {
        let internalRoom: string|null;
        try {
            // internalRoom = await this.datastore.getUserAdminRoom("-internal-");
            if (!internalRoom) {
                internalRoom = (await this.bridge.getIntent().createRoom({ options: {}})).room_id;
                // await this.datastore.setUserAdminRoom("-internal-", internalRoom);
            }
            const time = await this.bridge.pingAppserviceRoute(internalRoom);
            log.info(`Successfully pinged the bridge. Round trip took ${time}ms`);
        }
        catch (ex) {
            log.error("Homeserver cannot reach the bridge. You probably need to adjust your configuration.", ex);
        }
    }


    async disableHookHandler() {
        if (this.slackHookHandler) {
            await this.slackHookHandler.close();
            this.slackHookHandler = undefined;
            log.info("Disabled hook handler");
        }
    }

    public enableHookHandler() {
        this.slackHookHandler = new SlackHookHandler(this);
        log.info("Enabled hook handler");
    }
}
