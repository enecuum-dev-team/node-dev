/**
 * Node Trinity source code
 * See LICENCE file at the top of the source tree
 *
 * ******************************************
 *
 * Worker.js
 * Module doing regular work
 *
 * ******************************************
 *
 * Authors: K. Zhidanov, A. Prudanov, M. Vasil'ev
 */

const Transport = require('./Transport').Tip;

const check_pending_timeout = 1000 * 60 * 5;
const pow_stat_timeout = 1000 * 60 * 10;
const interval_blocks = 60 * 10 / 15;

class Worker {

    constructor(db, config) {
        console.info(`Worker process started`);

        this.db = db;
        this.config = config;
        this.transport = new Transport(this.config.id, 'worker');

        if(config.enable_post_tx)
            this.pending = setImmediate(async () => { await this.checkPending(); }, check_pending_timeout);
        this.pow_stat = setImmediate(async () => { await this.powChallengeStat(); }, pow_stat_timeout);
    }

    async checkPending() {
        let txs = await this.db.get_pending();
        let now = Math.floor(new Date());
        for(let tx of txs){
            console.debug(`time added ${Math.floor(new Date(tx.timeadded))}, now ${now}`);
            if(Math.floor(new Date(tx.timeadded)) < (now - check_pending_timeout)){
                console.debug(`Rebroadcast tx = ${tx.hash}`);
                this.transport.broadcast("post_tx", tx);
            }
        }
        setTimeout(async () => { await this.checkPending(); }, check_pending_timeout);
    }

    async powChallengeStat() {
        let clients = await this.db.current_clients_list();
        let now = Math.floor(new Date() / 1000);
        for (let client of clients) {
            let tail = await this.db.peek_tail();

            let start_n = tail.n - interval_blocks;
            let client_tail = await this.transport.unicast(client.ipstring, "peek");
            let client_start_of_chain = await this.transport.unicast(client.ipstring, "get_chain_start");
            let uptime = 0;
            let start_offset = 0;
            if (client_tail.n > start_n) {
                if (client_start_of_chain.n > start_n)
                    start_offset = start_n - client_start_of_chain.n;
                uptime = (start_offset + client_tail.n - start_n) / interval_blocks
            }
            await this.db.put_pow_stat(now, client.ipstring, client.pub, uptime);
        }
        setTimeout(async () => {
            await this.powChallengeStat();
        }, pow_stat_timeout);
    }
}

module.exports.Worker = Worker;