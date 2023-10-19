import {AppServiceRegistration, Bridge, Intent, Logger, StateLookup} from "matrix-appservice-bridge";
import {IConfig} from "./IConfig";
import {SlackHookHandler} from "./SlackHookHandler";
import {SlackRoomStore} from "./bridge1/SlackRoomStore";
import {Datastore} from "./datastore/Models";
import {SlackGhostStore} from "./bridge1/SlackGhostStore";

const STARTUP_RETRY_TIME_MS = 5000;
const log = new Logger("Main");
export class Main {
    private ready = false;
    private bridge: Bridge;
    private stateStorage: StateLookup|null = null;
    private slackHookHandler?: SlackHookHandler;
    public datastore!: Datastore;
    private ghosts!: SlackGhostStore; // Defined in .run
    public readonly rooms: SlackRoomStore = new SlackRoomStore();

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
                    log.info("context=" + context);
                    try{
                        // of course this fails if eimis_firstUser is not in the room
                        if (event.type === "m.room.message" && event.sender !== '@eimis_firstUser:matrix.local') {
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

    public get botIntent(): Intent {
        return this.bridge.getIntent();
    }

    public get botUserId(): string {
        return this.bridge.getBot().getUserId();
    }

    public get encryptRoom() {
        return this.config.encryption?.enabled;
    }

    public get ghostStore(): SlackGhostStore {
        return this.ghosts;
    }

    public async listGhostUsers(roomId: string): Promise<string[]> {
        const userIds = await this.listAllUsers(roomId);
        const regexp = new RegExp("^@" + this.config.username_prefix);
        return userIds.filter((i) => i.match(regexp));
    }

    public async listAllUsers(roomId: string): Promise<string[]> {
        const members = await this.bridge.getBot().getJoinedMembers(roomId);
        return Object.keys(members);
    }

    public getIntent(userId: string): Intent {
        return this.bridge.getIntent(userId);
    }

    // public getUrlForMxc(mxcUrl: string, local = false): string {
    //     // Media may be encrypted, use this.
    //     let baseUrl = this.config.homeserver.url;
    //     // if (this.config.encryption?.enabled && local) {
    //     //     baseUrl = this.config.encryption?.pantalaimon_url;
    //     // } else if (this.config.homeserver.media_url) {
    //     //     baseUrl = this.config.homeserver.media_url;
    //     // }
    //     return `${baseUrl}/_matrix/media/r0/download/${mxcUrl.slice("mxc://".length)}`;
    // }

    /**
     * Ensures the bridge bot is registered and updates its profile info.
     */
    private async applyBotProfile() {
        log.info("Ensuring the bridge bot is registered");
        const intent = this.botIntent;
        await intent.ensureRegistered(true);
        const profile = await intent.getProfileInfo(this.botUserId);
        if (this.config.bot_profile?.displayname && profile.displayname !== this.config.bot_profile.displayname) {
            await intent.setDisplayName(this.config.bot_profile.displayname);
        }
        if (this.config.bot_profile?.avatar_url && profile.avatar_url !== this.config.bot_profile.avatar_url) {
            await intent.setAvatarUrl(this.config.bot_profile.avatar_url);
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

        this.stateStorage = new StateLookup({
            intent: this.botIntent,
            eventTypes: ["m.room.member", "m.room.power_levels"],
        });

        let joinedRooms: string[]|null = null;
        while(joinedRooms === null) {
            try {
                joinedRooms = await this.bridge.getBot().getJoinedRooms() as string[];
            } catch (ex) {
                const error = ex as {errcode?: string};
                if (error.errcode === 'M_UNKNOWN_TOKEN') {
                    log.error(
                        "The homeserver doesn't recognise this bridge, have you configured the homeserver with the appservice registration file?"
                    );
                } else {
                    log.error("Failed to fetch room list:", ex);
                }
                log.error(`Waiting ${STARTUP_RETRY_TIME_MS}ms before retrying`);
                await new Promise(((resolve) => setTimeout(resolve, STARTUP_RETRY_TIME_MS)));
            }
        }

        try {
            await this.applyBotProfile();
        } catch (ex) {
            log.warn(`Failed to set bot profile on startup: ${ex}`);
        }


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

        // log.info("Bridge initialised and listening on " + cliPort);
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
