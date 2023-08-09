/**
 * Node Trinity source code
 * See LICENCE file at the top of the source tree
 *
 * ******************************************
 *
 * contracts_003.js
 * Enecuum smart contracts logic
 *
 * Working with actual chain
 * Added Bridge contracts
 * ENX should be bridged and set in config.json
 *
 * ******************************************
 *
 * Authors: I. Velichko, K. Zhidanov, A. Prudanov, M. Vasil'ev
 */

const Utils = require('./Utils');
const {cTypes, cValidate} = require('./contractValidator')
const {ContractError} = require('./errors');
const contracts_002 = require('./contracts_002');
const ContractMachine = require('./SmartContracts');
const ContractParser = require('./contractParser').ContractParser;
const crypto = require('crypto');
const zlib = require('zlib');

class Contract{
    constructor() {
        this._mysql = require('mysql');
        this.type = null;
        this.pricelist = require('./pricelist').fork_block_003;
    }
    get mysql(){
        return this._mysql;
    }
}

class PoolLiquiditySellExactContract extends Contract {
    constructor(data) {
        super();
        this.data = data;
        this.type = this.data.type;
        this.enx_hash = Utils.DEX_ENX_TOKEN_HASH
        if(!this.validate())
            throw new ContractError("Incorrect contract");
    }
    validate() {
        /**
         * parameters:
         * asset_in : hex string 64 chars
         * asset_out : hex string 64 chars
         * amount_in : 1...Utils.MAX_SUPPLY_LIMIT
         * amount_out_min : 0...Utils.MAX_SUPPLY_LIMIT
         */
        let params = this.data.parameters;

        let paramsModel = ["asset_in", "asset_out", "amount_in", "amount_out_min"];
        if (paramsModel.some(key => params[key] === undefined)){
            throw new ContractError("Incorrect param structure");
        }
        let hash_regexp = /^[0-9a-fA-F]{64}$/i;
        if(!hash_regexp.test(params.asset_in))
            throw new ContractError("Incorrect asset_in format");
        if(!hash_regexp.test(params.asset_out))
            throw new ContractError("Incorrect asset_out format");

        let bigintModel = ["amount_in", "amount_out_min"];
        if (!bigintModel.every(key => (typeof params[key] === 'bigint'))){
            throw new ContractError("Incorrect field format, BigInteger expected");
        }
        if(params.amount_in <= BigInt(0) || params.amount_in > Utils.MAX_SUPPLY_LIMIT){
            throw new ContractError("Incorrect amount_in");
        }
        if(params.amount_out_min < BigInt(0) || params.amount_out_min > Utils.MAX_SUPPLY_LIMIT){
            throw new ContractError("Incorrect amount_out_min");
        }
        return true;
    }
    async execute(tx, substate) {
        /**
         * check asset_in, asset_out exist
         * check pool exist
         * check pubkey amount_in balance
         * change pool liquidity
         * decrease pubkey amount_in balances
         * increase pubkey amount_out balances
         */
        if(this.data.type === undefined)
            return null;
        let params = this.data.parameters;

        let BURN_ADDRESS = Utils.DEX_BURN_ADDRESS;
        let CMD_ADDRESS = Utils.DEX_COMMANDER_ADDRESS;
        let ENX_TOKEN_HASH = this.enx_hash;

        let assets = Utils.getPairId(params.asset_in, params.asset_out);
        let pair_id = assets.pair_id;

        let pool_exist = await substate.dex_check_pool_exist(pair_id);
        if(!pool_exist)
            throw new ContractError(`Pool ${pair_id} not exist`);

        let pool_info = await substate.dex_get_pool_info(pair_id);

        let volume_in =  params.asset_in === pool_info.asset_1 ? pool_info.volume_1 : pool_info.volume_2;
        let volume_out = params.asset_in === pool_info.asset_2 ? pool_info.volume_1 : pool_info.volume_2;
        let k = volume_in * volume_out;

        let amount_in = params.amount_in;
        //// amount_out = volume_2 - k/(volume_1 + amount_in)
        let amount_out = volume_out - (k / (volume_in + (amount_in * (Utils.PERCENT_FORMAT_SIZE - pool_info.pool_fee) / Utils.PERCENT_FORMAT_SIZE)));

        // Other formula
        //// amount_out =  (volume_out * amount_out) / (volume_in + amount_out)
        //let amount_out_wFee = (amount_in * (Utils.PERCENT_FORMAT_SIZE - pool_info.pool_fee));
        //let amount_out = (volume_out * amount_out_wFee) / ((volume_in * Utils.PERCENT_FORMAT_SIZE + amount_out_wFee));

        if(amount_out < params.amount_out_min)
            throw new ContractError(`Slippage overlimit`);

        let lt_info = await substate.get_token_info(pool_info.token_hash);

        // cmd_lt_amount = (sqrtK2 - sqrtK1) / cmd_fee * sqrtK2 + sqrtK1
        let K_new = (volume_in + amount_in) * (volume_out - amount_out);
        let cmd_lt_amount_num = Utils.sqrt(K_new) - Utils.sqrt(k);
        let cmd_lt_amount_den = Utils.DEX_COMMANDER_FEE * (Utils.sqrt(K_new)) + Utils.sqrt(k);
        let cmd_lt_amount = lt_info.total_supply * cmd_lt_amount_num / cmd_lt_amount_den;

        let lt_pool_exist = false
        if (ENX_TOKEN_HASH) {
            let lt_assets = Utils.getPairId(ENX_TOKEN_HASH, pool_info.token_hash);
            lt_pool_exist = await substate.dex_check_pool_exist(lt_assets.pair_id);
        }
        substate.accounts_change({
            id : lt_pool_exist ? CMD_ADDRESS : BURN_ADDRESS,
            amount : cmd_lt_amount,
            token : pool_info.token_hash,
        });

        let pool_data = {
            pair_id : `${pool_info.asset_1}${pool_info.asset_2}`,
            volume_1 : (params.asset_in === pool_info.asset_1) ? (amount_in) : (BigInt(-1) * amount_out),
            volume_2 : (params.asset_in === pool_info.asset_1) ? (BigInt(-1) * amount_out) : (amount_in)
        };

        let tok_data = {
            hash : pool_info.token_hash,
            total_supply : cmd_lt_amount
        };
        substate.accounts_change({
            id : tx.from,
            amount : BigInt(-1) * amount_in,
            token : params.asset_in,
        });
        substate.accounts_change({
            id : tx.from,
            amount : amount_out,
            token : params.asset_out,
        });
        substate.tokens_change(tok_data);
        substate.pools_change(pool_data);

        return {
            amount_changes : [],
            pos_changes : [],
            post_action : [],
            dex_swap : {
                in : amount_in,
                out : amount_out,
                cmd_lt_amount : cmd_lt_amount
            }
        };
    }
}
class PoolLiquidityBuyExactContract extends Contract {
    constructor(data) {
        super();
        this.data = data;
        this.type = this.data.type;
        this.enx_hash = Utils.DEX_ENX_TOKEN_HASH
        if(!this.validate())
            throw new ContractError("Incorrect contract");
    }
    validate() {
        /**
         * parameters:
         * asset_in : hex string 64 chars
         * asset_out : hex string 64 chars
         * amount_out : 1...Utils.MAX_SUPPLY_LIMIT
         * amount_in_max : 1...Utils.MAX_SUPPLY_LIMIT
         */
        let params = this.data.parameters;

        let paramsModel = ["asset_in", "asset_out", "amount_in_max",  "amount_out"];
        if (paramsModel.some(key => params[key] === undefined)){
            throw new ContractError("Incorrect param structure");
        }
        let hash_regexp = /^[0-9a-fA-F]{64}$/i;
        if(!hash_regexp.test(params.asset_in))
            throw new ContractError("Incorrect asset_in format");
        if(!hash_regexp.test(params.asset_out))
            throw new ContractError("Incorrect asset_out format");

        let bigintModel = ["amount_in_max",  "amount_out"];
        if (!bigintModel.every(key => (typeof params[key] === 'bigint'))){
            throw new ContractError("Incorrect field format, BigInteger expected");
        }

        if(params.amount_in_max <= BigInt(0) || params.amount_in_max > Utils.MAX_SUPPLY_LIMIT){
            throw new ContractError("Incorrect amount_in_max");
        }
        if(params.amount_out < BigInt(0) || params.amount_out > Utils.MAX_SUPPLY_LIMIT){
            throw new ContractError("Incorrect amount_out");
        }
        return true;
    }
    async execute(tx, substate) {
        /**
         * check asset_in, asset_out exist
         * check pool exist
         * check pubkey amount_in balance
         * change pool liquidity
         * decrease pubkey amount_in balances
         * increase pubkey amount_out balances
         */
        if(this.data.type === undefined)
            return null;
        let params = this.data.parameters;

        let BURN_ADDRESS = Utils.DEX_BURN_ADDRESS;
        let CMD_ADDRESS = Utils.DEX_COMMANDER_ADDRESS;
        let ENX_TOKEN_HASH = this.enx_hash;

        let assets = Utils.getPairId(params.asset_in, params.asset_out);
        let pair_id = assets.pair_id;

        let pool_exist = await substate.dex_check_pool_exist(pair_id);
        if(!pool_exist)
            throw new ContractError(`Pool ${pair_id} not exist`);

        let pool_info = await substate.dex_get_pool_info(pair_id);

        let volume_in =  params.asset_in === pool_info.asset_1 ? pool_info.volume_1 : pool_info.volume_2;
        let volume_out = params.asset_in === pool_info.asset_2 ? pool_info.volume_1 : pool_info.volume_2;
        let k = volume_in * volume_out;

        // TODO
        // if(params.amount_in > k - volume_in)
        //     throw new ContractError(`Too much liquidity for pool ${pair_id}`);

        let amount_out = params.amount_out;
        //// amount_in = ((volume_in * amount_out) / (volume_out - amount_out)) - volume_in
        // let amount_in = (k / (volume_out - (amount_out * (Utils.PERCENT_FORMAT_SIZE - pool_info.pool_fee) / Utils.PERCENT_FORMAT_SIZE))) - volume_in;

        // Other formula
        //// amount_in = (volume_in * amount_out) / (volume_out - amount_out)
        let amount_in = ((volume_in * amount_out * Utils.PERCENT_FORMAT_SIZE ) / (((volume_out - amount_out) * (Utils.PERCENT_FORMAT_SIZE - pool_info.pool_fee))));


        if(amount_in > params.amount_in_max)
            throw new ContractError(`Slippage overlimit`);

        let lt_info = await substate.get_token_info(pool_info.token_hash);

        // cmd_lt_amount = (sqrtK2 - sqrtK1) / cmd_fee * sqrtK2 + sqrtK1
        let K_new = (volume_in + amount_in) * (volume_out - amount_out);
        let cmd_lt_amount_num = Utils.sqrt(K_new) - Utils.sqrt(k);
        let cmd_lt_amount_den = Utils.DEX_COMMANDER_FEE * (Utils.sqrt(K_new)) + Utils.sqrt(k);
        let cmd_lt_amount = lt_info.total_supply * cmd_lt_amount_num / cmd_lt_amount_den;

        let lt_pool_exist = false
        if (ENX_TOKEN_HASH) {
            let lt_assets = Utils.getPairId(ENX_TOKEN_HASH, pool_info.token_hash);
            lt_pool_exist = await substate.dex_check_pool_exist(lt_assets.pair_id);
        }
        substate.accounts_change({
            id : lt_pool_exist ? CMD_ADDRESS : BURN_ADDRESS,
            amount : cmd_lt_amount,
            token : pool_info.token_hash,
        });

        let pool_data = {
            pair_id : `${pool_info.asset_1}${pool_info.asset_2}`,
            volume_1 : (params.asset_in === pool_info.asset_1) ? (amount_in) : (BigInt(-1) * amount_out),
            volume_2 : (params.asset_in === pool_info.asset_1) ? (BigInt(-1) * amount_out) : (amount_in)
        };

        let tok_data = {
            hash : pool_info.token_hash,
            total_supply : cmd_lt_amount
        };
        substate.accounts_change({
            id : tx.from,
            amount : BigInt(-1) * amount_in,
            token : params.asset_in,
        });
        substate.accounts_change({
            id : tx.from,
            amount : amount_out,
            token : params.asset_out,
        });
        substate.tokens_change(tok_data);
        substate.pools_change(pool_data);

        return {
            amount_changes : [],
            pos_changes : [],
            post_action : [],
            dex_swap : {
                in : amount_in,
                out : amount_out,
                cmd_lt_amount : cmd_lt_amount
            }
        };
    }
}

class DexCmdDistributeContract extends Contract {
    constructor(data) {
        super();
        this.data = data;
        this.type = this.data.type;
        this.enx_hash = Utils.DEX_ENX_TOKEN_HASH
        if(!this.validate())
            throw new ContractError("Incorrect contract");
    }
    validate() {
        /**
         * parameters:
         * token_hash : hex string 64 chars
         */
        let params = this.data.parameters;

        let paramsModel = ["token_hash"];
        if (paramsModel.some(key => params[key] === undefined)){
            throw new ContractError("Incorrect param structure");
        }
        let hash_regexp = /^[0-9a-fA-F]{64}$/i;
        if(!hash_regexp.test(params.token_hash))
            throw new ContractError("Incorrect token_hash format");
        return true;
    }
    async execute(tx, substate, kblock, config) {
        /**
         * Check cmd's balance
         * get ltoken pool
         * swap lp_token to ENX
         * Add ENX to farm
         */
        if(this.data.type === undefined)
            return null;
        let params = this.data.parameters;

        let cfactory = new ContractMachine.ContractFactory(config);
        let cparser = new ContractParser(config);

        let ENX_TOKEN_HASH = this.enx_hash;
        let ENX_FARM_ID = Utils.DEX_SPACE_STATION_ID;
        let CMD_ADDRESS = Utils.DEX_COMMANDER_ADDRESS;

        let balance = (await substate.get_balance(CMD_ADDRESS, params.token_hash));
        if(BigInt(balance.amount) <= BigInt(0))
            throw new ContractError(`Token ${params.token_hash} insufficient balance`);

        let swap_object = {
            type : "pool_sell_exact",
            parameters : {
                asset_in : params.token_hash,
                asset_out : ENX_TOKEN_HASH,
                amount_in : BigInt(balance.amount),
                amount_out_min : BigInt(0)
            }
        };

        let swap_data = cparser.dataFromObject(swap_object);
        let swap_contract = cfactory.createContract(swap_data);

        // change tx object to call a contract by cmder
        let _tx = {
            amount : tx.amount,
            from : CMD_ADDRESS,
            data : tx.data,
            ticker : tx.ticker,
            to : tx.to
        };
        try {
            let swap_res = await swap_contract.execute(_tx, substate);
        }
        catch (e) {
            if(e instanceof ContractError){
                console.log(e);
                return {
                    amount_changes : [],
                    pos_changes : [],
                    post_action : []
                };
            }
            else throw e;
        }

        let balance_enx = (await substate.get_balance(CMD_ADDRESS, ENX_TOKEN_HASH));
        if(BigInt(balance_enx.amount) <= BigInt(0))
            throw new ContractError(`Token ${ENX_TOKEN_HASH} insufficient balance`);

        let dist_object = {
            type : "farm_add_emission",
            parameters : {
                farm_id : ENX_FARM_ID,
                amount : balance_enx.amount
            }
        };

        let dist_data = cparser.dataFromObject(dist_object);
        let dist_contract = cfactory.createContract(dist_data);

        try {
            let dist_res = await dist_contract.execute(_tx, substate, kblock);
        }
        catch (e) {
            if(e instanceof ContractError){
                console.log(e);
                return {
                    amount_changes : [],
                    pos_changes : [],
                    post_action : []
                };
            }
            else throw e;
        }
        return {
            amount_changes : [],
            pos_changes : [],
            post_action : []
        };
    }
}

class LockContract extends Contract {
    constructor(data) {
        super()
        this.data = data
        this.type = this.data.type

        let decompressed = zlib.brotliDecompressSync(Buffer.from(data.parameters.compressed_data, 'base64'))
        this.data.parameters = JSON.parse(decompressed.toString())

        if(!this.validate())
            throw new ContractError("Incorrect contract")
    }

    validate () {
        let paramsModel = {
            dst_address : cTypes.hexStr1_66,
            dst_network : cTypes.int,
            amount : cTypes.str,
            hash : cTypes.enqHash64,
            nonce :  cTypes.int
        }
        if (!cValidate(this.data.parameters, paramsModel))
            throw new ContractError("Validation error")
        return true
    }
    
    async execute(tx, substate, kblock, config) {
        if (substate.get_known_networks().find(network => network.id == this.data.parameters.dst_network) === undefined)
            throw new ContractError("Unknown network")

        let cparser = new ContractParser(config)
        let cfactory = new ContractMachine.ContractFactory(config)
        let lock_tokens = async (hash, amount) => {
            substate.accounts_change({
                id : tx.from,
                amount : -amount,
                token : hash,
            })
            substate.accounts_change({
                id : Utils.BRIDGE_ADDRESS,
                amount : amount,
                token : hash,
            })
            return {
                amount_changes : [],
                pos_changes : [],
                post_action : []
            }
        }
        let burn_tokens = async (hash, amount) => {
            let burn_object = {
                type : "burn",
                parameters : {
                    token_hash : hash,
                    amount : BigInt(amount)
                }
            }

            let burn_data = cparser.dataFromObject(burn_object)
            let burn_contract = cfactory.createContract(burn_data)

            await lock_tokens(hash, amount)
            let _tx = {
                amount : tx.amount,
                from : Utils.BRIDGE_ADDRESS,
                data : burn_data,
                ticker : tx.ticker,
                to : tx.to
            }

            return await burn_contract.execute(_tx, substate)
        }
        let validateDecimals = (params) => {
            if (dstDecimals < srcDecimals)
                return BigInt(params.amount) % (10n ** BigInt(srcDecimals - dstDecimals)) == 0
            return true
        }

        let data = this.data.parameters

        let channel = substate.get_channel_by_id({
            src_address : tx.from,
            src_hash : data.hash,
            dst_network : data.dst_network,
            dst_address : data.dst_address
        })

        if (Number(++channel.nonce) !== data.nonce)
            throw new ContractError(`Wrong nonce of the bridge lock transfer. Prev: ${Number(channel.nonce) - 1}, cur: ${data.nonce}, channel_id: ${channel.channel_id}`)
        substate.change_channel(channel)

        let wrappedToken = substate.get_minted_token(data.hash)
        let dstDecimals = substate.get_known_networks().find(network => network.id == data.dst_network).decimals
        let srcDecimals = substate.get_token_info(data.hash).decimals
        if (wrappedToken && wrappedToken.origin_network == data.dst_network)
            dstDecimals = wrappedToken.origin_decimals
        if (!validateDecimals(data))
            throw new ContractError("Lock contract: Fraction too low")

        let res
        if (wrappedToken) {
            res = await burn_tokens(data.hash, data.amount);
            res.bridge_burn = {
                hash : data.hash,
                amount : data.amount
            }
        } else {
            res = await lock_tokens(data.hash, data.amount);
            res.bridge_lock = {
                hash : data.hash,
                amount : data.amount
            }
        }
        return res
    }
}

class ClaimInitContract extends Contract {
    constructor(data) {
        super()
        this.data = data
        this.type = this.data.type

        let decompressed = zlib.brotliDecompressSync(Buffer.from(data.parameters.compressed_data, 'base64'))
        this.data.parameters = JSON.parse(decompressed.toString())

        if(!this.validate())
            throw new ContractError("Incorrect contract")
    }

    validate () {
        let paramsModel = {
            dst_address : cTypes.enqHash66,
            dst_network : cTypes.int,
            amount : cTypes.strBigInt,
            src_hash : cTypes.hexStr1_64,
            src_address : cTypes.hexStr1_66,
            src_network : cTypes.int,
            origin_hash : cTypes.hexStr1_64,
            origin_network : cTypes.int,
            nonce : cTypes.int,
            ticket_hash : cTypes.enqHash64,
            ticker : cTypes.str,
            origin_decimals : cTypes.byte,
            name : cTypes.str40
        }
        cValidate(this.data.parameters, paramsModel)
        let amount = BigInt(this.data.parameters.amount)
        if (amount < 0n || amount > BigInt(Utils.MAX_SUPPLY_LIMIT))
            throw new ContractError("Incorrect amount")
        if (Number(Utils.BRIDGE_NETWORK_ID) !== Number(this.data.parameters.dst_network))
            throw new ContractError("Wrong network id")
        let modelTmp = {...paramsModel}
        delete modelTmp.ticket_hash
        let paramsStr = Object.keys(modelTmp).map(v => crypto.createHash('sha256').update(this.data.parameters[v].toString().toLowerCase()).digest('hex')).join("")
        let ticket_hash = crypto.createHash('sha256').update(paramsStr).digest('hex')
        if (ticket_hash !== this.data.parameters.ticket_hash)
            throw new ContractError(`Wrong ticket_hash. Expected: ${ticket_hash}, actual: ${this.data.parameters.ticket_hash}`)
        return true
    }

    async execute(tx, substate, kblock, config) {
        let data = this.data.parameters
        let last_t = substate.get_bridge_claim_transfers(data.src_address, data.dst_address, data.src_network, data.src_hash)
        if (last_t === null)
            last_t = {nonce : 0}
        if (Number(last_t.nonce) + 1 !== data.nonce)
            throw new ContractError(`Wrong nonce of the bridge transfer. Prev: ${last_t.nonce}, cur: ${data.nonce}, ticket_hash: ${data.ticket_hash}`)
        
        substate.transfers_add(data)
        return {
            amount_changes : [],
            pos_changes : [],
            post_action : [],
            claim_init : 0
        }
    }
}

class ClaimConfirmContract extends Contract {
    constructor(data) {
        super()
        this.data = data
        this.type = this.data.type
        
        let decompressed = zlib.brotliDecompressSync(Buffer.from(data.parameters.compressed_data, 'base64'))
        this.data.parameters = JSON.parse(decompressed.toString())

        if(!this.validate())
            throw new ContractError("Incorrect contract")
    }

    validate () {
        let paramsModel = {
            validator_id : cTypes.enqHash66,
            validator_sign : cTypes.hexStr1_150,
            ticket_hash : cTypes.enqHash64
        }

        return cValidate(this.data.parameters, paramsModel)
    }

    async executeClaim(tx, substate, kblock, config) {
        let cfactory = new ContractMachine.ContractFactory(config)
        let cparser = new ContractParser(config)
        let mint_tokens = async (amount, hash) => {
            let mint_object = {
                type : "mint",
                parameters : {
                    token_hash : hash,
                    amount : amount
                }
            }

            let mint_data = cparser.dataFromObject(mint_object)
            let mint_contract = cfactory.createContract(mint_data)

            let _tx = {
                amount : tx.amount,
                from : Utils.BRIDGE_ADDRESS,
                data : mint_data,
                ticker : tx.ticker,
                to : tx.to,
                hash : tx.hash
            }

            return await mint_contract.execute(_tx, substate)
        }

        let transfer = (hash, amount, dstAddress) => {
            let newUserAmount = amount
            let newBridgeAmount = -amount
            substate.accounts_change({
                id : dstAddress,
                amount : newUserAmount,
                token : hash,
            })
            substate.accounts_change({
                id : Utils.BRIDGE_ADDRESS,
                amount : newBridgeAmount,
                token : hash,
            })
            return {
                amount_changes : [],
                pos_changes : [],
                post_action : []
            }
        }

        let createToken = async (ticket) => {
            let {amount, ticker, name, origin_decimals} = ticket
            let decimals = 10n
            origin_decimals = BigInt(origin_decimals)
            if (origin_decimals < decimals)
                decimals = origin_decimals

            let native_token = substate.get_token_info(tx.ticker)
            let token_create_object = {
                type : "create_token",
                parameters : {
                    fee_type : 2,
                    fee_value : BigInt(native_token.fee_value),
                    fee_min : BigInt(native_token.fee_min),
                    ticker : ticker.toUpperCase(),
                    decimals : BigInt(decimals),
                    total_supply : BigInt(amount),
                    max_supply : BigInt(amount),
                    name : name,
                    minable : 0,
                    reissuable : 1,
                    referrer_stake : 0n,
                    ref_share : 0n,
                    block_reward : 0n,
                    min_stake : 0n,
                }
            }
            let token_create_data = cparser.dataFromObject(token_create_object);
            let token_create_contract = cfactory.createContract(token_create_data);

            let token_price = BigInt(this.pricelist.create_token);

            let _tx = {
                amount : token_price,
                from : Utils.BRIDGE_ADDRESS,
                data : token_create_data,
                ticker : tx.ticker,
                to : tx.to,
                hash : tx.hash
            }
            return await token_create_contract.execute(_tx, substate)
        }

        let ticket = substate.get_bridge_claim_transfers_by_id(this.data.parameters.ticket_hash)
        let res
        if (Number(ticket.origin_network) === Number(ticket.dst_network)) {
            res = transfer(ticket.origin_hash, ticket.amount, ticket.dst_address)
            res.bridge_unlock = ticket.amount;
        } else {
            let minted = substate.get_minted_token_by_origin(ticket.origin_hash, ticket.origin_network)
            if (minted !== null && minted !== undefined) {
                await mint_tokens(ticket.amount, minted.wrapped_hash)
                res = transfer(minted.wrapped_hash, ticket.amount, ticket.dst_address)
            } else {
                let tokenCreateRes = await createToken(ticket)
                substate.minted_add({
                    wrapped_hash : tokenCreateRes.token_info.hash,
                    origin_network : ticket.origin_network,
                    origin_hash : ticket.origin_hash,
                    origin_decimals : ticket.origin_decimals
                })
                res = transfer(tokenCreateRes.token_info.hash, ticket.amount, ticket.dst_address)
            }
            res.bridge_mint = ticket.amount;
        }
        return res
    }

    async execute(tx, substate, kblock, config) {
        let data = this.data.parameters
        if (!substate.get_validators().find(id => id === data.validator_id))
            throw new ContractError(`Unknown validator: ${data.validator_id}`)
        if (!Utils.ecdsa_verify(data.validator_id, data.validator_sign, data.ticket_hash))
            throw new ContractError(`Wrong validator sign. Ticket_hash: ${data.ticket_hash}`)

        let bridge_confirmations = substate.add_confirmation(data)
        if (bridge_confirmations === substate.get_bridge_settings().threshold)
            return await this.executeClaim(tx, substate, kblock, config)

        return {
            amount_changes : [],
            pos_changes : [],
            post_action : []
        }
    }
}

class BridgeOwnerContract extends Contract {
    constructor(data) {
        super()
        this.data = data
        this.type = this.data.type
        if(!this.validate())
            throw new ContractError("Incorrect contract")
    }

    validate () {}

    async execute(tx, substate, kblock, config) {
        let {owner} = substate.get_bridge_settings()
        if (tx.from !== owner)
            throw new ContractError(`Only owner is allowed to control the bridge`)
        let res = await this.bridgeControl(tx, substate, kblock, config)
        if (!res)
            return {
                amount_changes : [],
                pos_changes : [],
                post_action : []
            }
        return res
    }
}

class BridgeSetOwnerContract extends BridgeOwnerContract {
    constructor(data) { super(data) }

    validate () {
        let paramsModel = {
            pubkey : cTypes.enqHash66
        }
        return cValidate(this.data.parameters, paramsModel)
    }

    async bridgeControl(tx, substate, kblock, config) {
        substate.set_bridge({
            owner : this.data.parameters.pubkey
        })
    }
}

class BridgeSetThresholdContract extends BridgeOwnerContract {
    constructor(data) { super(data) }

    validate () {
        let paramsModel = {
            threshold : cTypes.int
        }
        return cValidate(this.data.parameters, paramsModel)
    }

    async bridgeControl(tx, substate, kblock, config) {
        substate.set_bridge({
            threshold : this.data.parameters.threshold
        })
    }
}

class BridgeAddValidatorContract extends BridgeOwnerContract {
    constructor(data) { super(data) }

    validate () {
        let paramsModel = {
            pubkey : cTypes.enqHash66
        }
        return cValidate(this.data.parameters, paramsModel)
    }

    async bridgeControl(tx, substate, kblock, config) {
        let pk = this.data.parameters.pubkey
        if (substate.get_validators().find(validator => validator === pk))
            throw new ContractError(`Validator ${pk} already exists`)
        substate.add_validator(pk)
    }
}

class BridgeRemoveValidatorContract extends BridgeOwnerContract {
    constructor(data) { super(data) }

    validate () {
        let paramsModel = {
            pubkey : cTypes.enqHash66
        }
        return cValidate(this.data.parameters, paramsModel)
    }

    async bridgeControl(tx, substate, kblock, config) {
        let pk = this.data.parameters.pubkey
        if (!substate.get_validators().find(validator => validator === pk))
            throw new ContractError(`Validator ${pk} doesn't exist`)
        substate.remove_validator(pk)
    }
}

class BridgeAddNetworkContract extends BridgeOwnerContract {
    constructor(data) { super(data) }

    validate () {
        let paramsModel = {
            id : cTypes.int,
            decimals : cTypes.byte
        }
        return cValidate(this.data.parameters, paramsModel)
    }

    async bridgeControl(tx, substate, kblock, config) {
        let {id, decimals} = this.data.parameters
        if (substate.get_known_networks().find(network => network.id === id))
            throw new ContractError(`Network ${id} already exists`)
        substate.add_network(id, decimals)
    }
}

class BridgeRemoveNetworkContract extends BridgeOwnerContract {
    constructor(data) { super(data) }

    validate () {
        let paramsModel = {
            id : cTypes.int,
        }
        return cValidate(this.data.parameters, paramsModel)
    }

    async bridgeControl(tx, substate, kblock, config) {
        let id = this.data.parameters.id
        if (!substate.get_known_networks().find(network => network.id === id))
            throw new ContractError(`Network ${id} doesn't exist`)
        substate.remove_network(id)
    }
}

module.exports = contracts_002;
module.exports.Contract = Contract;

module.exports.PoolLiquiditySellExactContract = PoolLiquiditySellExactContract;
module.exports.PoolLiquidityBuyExactContract = PoolLiquidityBuyExactContract;

module.exports.BridgeSetOwnerContract = BridgeSetOwnerContract;
module.exports.BridgeSetThresholdContract = BridgeSetThresholdContract;
module.exports.BridgeAddValidatorContract = BridgeAddValidatorContract;
module.exports.BridgeRemoveValidatorContract = BridgeRemoveValidatorContract;
module.exports.BridgeAddNetworkContract = BridgeAddNetworkContract;
module.exports.BridgeRemoveNetworkContract = BridgeRemoveNetworkContract;

module.exports.LockContract = LockContract;
module.exports.ClaimInitContract = ClaimInitContract;
module.exports.ClaimConfirmContract = ClaimConfirmContract;

module.exports.DexCmdDistributeContract = DexCmdDistributeContract;
