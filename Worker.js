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

class Worker {

    constructor(db, config) {
        console.info(`Worker process started`);

        this.db = db;
        this.config = config;
        this.transport = new Transport(this.config.id, 'worker');

        this.pending = setImmediate(async () => { await this.checkPending(); }, check_pending_timeout);
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
}

module.exports.Worker = Worker;