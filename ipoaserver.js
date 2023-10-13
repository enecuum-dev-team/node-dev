const crypto = require('crypto');
const argv = require('yargs').argv;
const fs = require('fs');

const Pending = require('./Pending');
const Utils = require('./Utils');
const DB = require('./DB').DB;
const PoAServer = require('./PoAServer').PoAServer;

const CONFIG_FILENAME = 'config.json';

let config = {
    target_speed: 15,
    load: 0,
    peek_limit: 100,
    difficulty: 18,
    port: 8000,
    diff_target: 10, //sec
    dbhost: 'localhost',
    dbport: 3306,
    dbname: 'trinity',
    dbuser: 'root',
    dbpass: '',
    loglevel: 'info',
    explorer: 0,
    feeder_interval_ms: 100,
    cashier_interval_ms: 0,
    cashier_chunk_size: 2,
    indexer_interval_ms: 0,
    pending_size: 10,
    reward_ratio: {
        pos: 4000,
        poa: 4000,
        pow: 1600,
        ref: 400,
    },
    mode: 'verify',
    poa_hearbeat_interval_ms: 25000,
    poa_min_interval_ms: 10000,
    pending_timeout: 15,
    tail_timeout: 1000,
    max_tps: 70,
    max_mblocks_per_macroblock: 100,
    min_mblocks_per_macroblock: 5,
    max_txs_per_macroblock: 300,
    max_txs_per_microblock: 50,
    min_txs_per_microblock: 1,
    enable_rnd_txs: false,
    transport_on: 1,
    first_message_always_probe: true,
    karma: {
        init: 0.5,
        dec: 2,
        min: 0.1,
        inc: 0.2,
        max: 0.9
    },
    mblock_slots: {
        size: 2,
        count: 2,
        min_stake: 5000000000000000,
        reserve: []
    },
};

console.trace = function (...msg) {
    console.log(...msg);
};

console.debug = function (...msg) {
    console.log(...msg);
};

console.silly = function (...msg) {
    console.log(...msg);
};

console.fatal = function (...msg) {
    console.log(...msg);
    process.exit(1);
};

require('console-stamp')(console, {datePrefix: '[', pattern:'yyyy.mm.dd HH:MM:ss', level: 'info', extend:{fatal:0, debug:4, trace:5, silly:6}, include:['silly', 'trace','debug','info','warn','error','fatal']});

console.info("Application started");

let config_filename = argv.config || CONFIG_FILENAME;

console.info('Loading config from', config_filename, '...');

let cfg = {};
try {
    cfg = JSON.parse(fs.readFileSync(config_filename, 'utf8'));
    config = Object.assign(config, cfg);
} catch (e) {
    console.info('No configuration file found.')
}

config = Object.assign(config, argv);

console.info(`config = ${JSON.stringify(config)}`);

let db = new DB({
    host: config.dbhost,
    port: config.dbport,
    user: config.dbuser,
    database: config.dbname,
    password: config.dbpass.toString(),
    dateStrings: true,
    multipleStatements: true
}, config);

let native_mblocks_count = 1;

feeder = async function (poa_server) {
    try {
        let k = await db.peek_tail();
        if (k === undefined)
            return;
        let kblocks_hash = k.hash;
        let mblocks = await db.get_microblocks(kblocks_hash);

        let owner_slots = await init_slots(config.mblock_slots.count, kblocks_hash);
        console.info(`owner_slots = ${JSON.stringify(owner_slots)}`);
        let txs_awaiting = 0;
        if (mblocks.length !== 0)
            txs_awaiting = (await db.get_txs_awaiting(mblocks.map(m => m.hash))).txs_awaiting;
        let now = Math.floor(new Date() / 1000);
        if ((txs_awaiting >= config.max_txs_per_macroblock || mblocks.length >= config.max_mblocks_per_macroblock || now > (k.time + config.feeder_watchdog)) && Utils.exist_native_token_count(mblocks) >= native_mblocks_count) {
            console.debug(`Transaction count exceeds config.max_txs_per_macroblock (${config.max_txs_per_macroblock})`);
            console.debug(`feeder watchdog - ${now > (k.time + config.feeder_watchdog)}`)
            let full_mblocks = await db.get_microblocks_full(kblocks_hash);
            console.debug(`broadcast microblocks count = ${full_mblocks.length}`);
            poa_server.transport.broadcast("microblocks", full_mblocks);
            poa_server.transport.selfcast("emit_m_root", "on_microblocks");
        } else {
            let txs_required = config.max_tps * (config.feeder_interval_ms * 0.001);
            txs_required = Math.min(config.max_txs_per_microblock, Math.max(config.min_txs_per_microblock, txs_required));

            for (const slot of owner_slots) {
                if (slot.count <= 0) {
                    continue;
                }
                if ((slot.id === undefined) && (mblocks.length >= config.max_mblocks_per_macroblock)) {
                    continue;
                }
                for (let i = 0; i < slot.count; i++) {
                    let txs = await pending.get_txs(txs_required, config.pending_timeout, config.enable_rnd_txs);
                    console.silly('txs = ', JSON.stringify(txs));
                    if (txs.length !== 0) {
                        let mblock_data = {kblocks_hash, txs};
                        let {sent, sent_hash} = await poa_server.send_mblock(mblock_data, slot.id, k.n);
                        if (sent) {
                            console.debug(`sent mblock ${sent_hash} for ${kblocks_hash} with txs [${txs.map(t => t.hash)}]`);
                        } else {
                            console.debug(`mblock NOT sent`);
                        }
                    } else {
                        console.debug(`no txs in pending`)
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(feeder, config.feeder_interval_ms, poa_server);
    }
};

let init_slots = async function(size, kblock_hash) {
    let owner_slots = await db.get_mining_tkn_owners(size-config.mblock_slots.reserve.length, config.mblock_slots.reserve, config.mblock_slots.min_stake);
    owner_slots = owner_slots.concat(config.mblock_slots.reserve.map(function(item) {
        return {id:item};
    }));
    owner_slots.forEach(item => item.count = config.mblock_slots.size); //set slot size
    let used_slots = await db.get_used_slots(kblock_hash);
    used_slots.forEach(item =>{
        let index = owner_slots.findIndex(e => e.id === item.id);
        if(index === -1)
            return;
        owner_slots[owner_slots.findIndex(e => e.id === item.id)].count = Number(owner_slots[owner_slots.findIndex(e => e.id === item.id)].count) - Number(item.count);
    });

    return owner_slots;
};


let start_leader = function(config, db) {
    BigInt.prototype.toJSON = function () {
        return this.toString()
    };

    pending = new Pending(db);

    let poa_server;
    if (config.poa_port !== undefined) {
        poa_server = new PoAServer(config, db);
    } else {
        console.info(`PoAServer is OFF`);
    }

    if (config.feeder_interval_ms) {
        console.info(`Starting feeder with interval ${config.feeder_interval_ms}`);
        feeder(poa_server);
    } else {
        console.info(`Feeder is OFF`);
    }
};
/*
let starter =  async function(config, db, callback) {
	if(!db.isConnected){
		setTimeout(starter, 1000, config, db, callback);
		return;
	}
	callback(config, db);
};

starter(config, db, start_leader);
*/
start_leader(config, db);