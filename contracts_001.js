/**
 * Node Trinity source code
 * See LICENCE file at the top of the source tree
 *
 * ******************************************
 *
 * contracts_000.js
 * Enecuum smart contracts logic
 *
 * Working with chain before 002 fork
 * Fix transfer contract transfer_lock check
 *
 * ******************************************
 *
 * Authors: K. Zhidanov, A. Prudanov, M. Vasil'ev
 */

const {ContractError} = require('./errors');
const contracts_000 = require('./contracts_000');

class Contract{
    constructor() {
        this._mysql = require('mysql');
        this.type = null;
        this.pricelist = require('./pricelist').fork_block_001;
    }
    get mysql(){
        return this._mysql;
    }
}

class PosTransferContract extends Contract {
    constructor(data) {
        super();
        this.data = data;
        this.type = this.data.type;
        if(!this.validate())
            throw new ContractError("Incorrect contract");
    }
    validate() {
        /**
         * parameters:
         * undelegate_id : hex string 64 chars
         */
        let params = this.data.parameters;

        let paramsModel = ["undelegate_id"];
        if (paramsModel.some(key => params[key] === undefined)){
            throw new ContractError("Incorrect param structure");
        }
        let hash_regexp = /^[0-9a-fA-F]{64}$/i;
        if(!hash_regexp.test(params.undelegate_id))
            throw new ContractError("Incorrect undelegate_id format");
        return true;
    }
    async execute(tx, substate, kblock) {
        /**
         * get undelegated from undelegates table by undelegated_id
         * check TRANSFER_LOCK time
         * update pos_transits
         * return new balance
         */
        if(this.data.type === undefined)
            return null;

        let params = this.data.parameters;

        let transfer = await substate.get_pos_undelegates(params.undelegate_id);
        if(transfer.delegator !== tx.from) {
            throw new ContractError("Undelegate TX sender and transfer TX sender doesn't match");
        }
        if(!transfer)
            throw new ContractError("Transfer not found");
        if(BigInt(transfer.amount) === BigInt(0))
            throw new ContractError("Transfer has already been processed");
        if(!this.checkTime(transfer, substate.get_transfer_lock(), kblock))
            throw new ContractError("Freeze time has not passed yet");

        let data = {
            id : params.undelegate_id,
            pos_id : params.pos_id,
            delegator : tx.from,
            amount : BigInt(0),
            height : kblock.n
        };

        substate.accounts_change({
            id : tx.from,
            amount : transfer.amount,
            token : tx.ticker,
        });
        substate.undelegates_change(data);

        return {
            amount_changes : [],
            pos_changes : [],
            post_action : []
        };
    }

    checkTime(transfer, transfer_lock, kblock){
        return (BigInt(kblock.n) - BigInt(transfer.height)) >= BigInt(transfer_lock);
    }
}

module.exports = contracts_000;
module.exports.Contract = Contract;
module.exports.PosTransferContract = PosTransferContract;