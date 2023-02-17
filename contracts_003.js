/**
 * Node Trinity source code
 * See LICENCE file at the top of the source tree
 *
 * ******************************************
 *
 * contracts_002.js
 * Enecuum smart contracts logic
 *
 * Working with actual chain
 * Added DEX contracts
 * Added Farms contracts
 * Added Commander ENEX contracts
 *
 * ******************************************
 *
 * Authors: K. Zhidanov, A. Prudanov, M. Vasil'ev
 */

const contracts_old = require('./contracts_002');
const Utils = require('./Utils');
const {cTypes, cValidate} = require('./contractValidator')
const {ContractError} = require('./errors');
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
        if (substate.get_known_networks().find(network => network.id == this.data.parameters.dst_network) === undefined)
            throw new ContractError("Unknown network")
        return true
    }
    
    async execute(tx, substate, kblock, config) {
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
        let get_channel_id = function (lock_data) {
            const model = ["dst_address", "dst_network", "amount", "hash"]
            let valuesFromObject = model.map(lock_param => lock_data[lock_param])
            valuesFromObject.push(tx.from)
            return crypto.createHash('sha256').update(valuesFromObject.sort().join("")).digest('hex')
        }


        let data = this.data.parameters

        let channel_id = get_channel_id(data)
        let channel = substate.get_channel_by_id(channel_id)
        if (Number(++channel.nonce) !== data.nonce)
            throw new ContractError(`Wrong nonce of the bridge lock transfer. Prev: ${channel.nonce - 1}, cur: ${channel.nonce}, channel_id: ${channel.channel_id}`)
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
            res = await burn_tokens(data.hash, data.amount)
        } else {
            res = await lock_tokens(data.hash, data.amount)
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
            transfer_id : cTypes.enqHash64,
            ticker : cTypes.str,
            origin_decimals : cTypes.byte,
            name : cTypes.str40
        }
        cValidate(this.data.parameters, paramsModel)
        if (Number(Utils.BRIDGE_NETWORK_ID) !== Number(this.data.parameters.dst_network))
            throw new ContractError("Wrong network id")
        let modelTmp = {...paramsModel}
        delete modelTmp.transfer_id
        let paramsStr = Object.keys(modelTmp).map(v => crypto.createHash('sha256').update(this.data.parameters[v].toString().toLowerCase()).digest('hex')).join("")
        let transfer_id = crypto.createHash('sha256').update(paramsStr).digest('hex')
        if (transfer_id !== this.data.parameters.transfer_id)
            throw new ContractError(`Wrong transfer_id. Expected: ${transfer_id}, actual: ${this.data.parameters.transfer_id}`)
        return true
    }
    
    async execute(tx, substate, kblock, config) {
        let data = this.data.parameters
        let last_t = substate.get_bridge_claim_transfers(data.src_address, data.dst_address, data.src_network, data.src_hash)
        if (last_t === null)
            last_t = {nonce : 0}
        if (Number(last_t.nonce) + 1 !== data.nonce)
            throw new ContractError(`Wrong nonce of the bridge transfer. Prev: ${last_t.nonce}, cur: ${data.nonce}, transfer_id: ${data.transfer_id}`)
        
        substate.transfers_add(data)
        return {
            amount_changes : [],
            pos_changes : [],
            post_action : []
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
            transfer_id : cTypes.enqHash64
        }

        return cValidate(this.data.parameters, paramsModel)
    }

    async execute(tx, substate, kblock, config) {
        let data = this.data.parameters
        if (!substate.get_validators().find(id => id === data.validator_id))
            throw new ContractError(`Unknown validator: ${data.validator_id}`)
        if (!Utils.ecdsa_verify(data.validator_id, data.validator_sign, data.transfer_id))
            throw new ContractError(`Wrong validator sign. Transfer_id: ${data.transfer_id}`)

        let cparser = new ContractParser(config)
        let cfactory = new ContractMachine.ContractFactory(config)

        let bridge_confirmations = substate.add_confirmation(data)
        if (bridge_confirmations === substate.get_bridge_settings().threshold) {
            let claim_object = {
                type : "claim",
                parameters : {
                    transfer_id : data.transfer_id
                }
            }
            let claim_data = cparser.dataFromObject(claim_object)
            let claim_contract = cfactory.createContract(claim_data)
            let _tx = {
                amount : tx.amount,
                from : tx.from,
                data : claim_data,
                ticker : tx.ticker,
                hash : tx.hash,
                to : tx.to
            }
            
            return await claim_contract.execute(_tx, substate, kblock, config)
        }
        return {
            amount_changes : [],
            pos_changes : [],
            post_action : []
        }
    }
}

class ClaimContract extends Contract {
    constructor(data) {
        super()
        this.data = data
        this.type = this.data.type
        if(!this.validate())
            throw new ContractError("Incorrect contract")
    }

    validate () {
        let paramsModel = {
            transfer_id : cTypes.enqHash64
        }

        return cValidate(this.data.parameters, paramsModel)
    }

    async execute(tx, substate, kblock, config) {
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
            let amount, ticker, name = ticket
            let token_create_object = {
                type : "create_token",
                parameters : {
                    fee_type : 2,
                    fee_value : 100000000n,
                    fee_min : 100000000n,
                    ticker : ticker.toUpperCase(),
                    decimals : 10n,
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

        let ticket = substate.get_bridge_claim_transfers_by_id(this.data.parameters.transfer_id)
        let res
        if (Number(ticket.origin_network) === Number(ticket.dst_network)) {
            res = transfer(ticket.origin_hash, ticket.amount, ticket.dst_address)
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
        }
        return res
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
        substate.remove_network(this.data.parameters.id)
    }
}

module.exports.Contract = Contract;

module.exports.TokenCreateContract = contracts_old.TokenCreateContract;
module.exports.TokenMintContract = contracts_old.TokenMintContract;
module.exports.TokenBurnContract = contracts_old.TokenBurnContract;

module.exports.BridgeSetOwnerContract = BridgeSetOwnerContract;
module.exports.BridgeSetThresholdContract = BridgeSetThresholdContract;
module.exports.BridgeAddValidatorContract = BridgeAddValidatorContract;
module.exports.BridgeRemoveValidatorContract = BridgeRemoveValidatorContract;
module.exports.BridgeAddNetworkContract = BridgeAddNetworkContract;
module.exports.BridgeRemoveNetworkContract = BridgeRemoveNetworkContract;

module.exports.LockContract = LockContract;
module.exports.ClaimInitContract = ClaimInitContract;
module.exports.ClaimConfirmContract = ClaimConfirmContract;
module.exports.ClaimContract = ClaimContract;

module.exports.PosCreateContract = contracts_old.PosCreateContract;
module.exports.PosDelegateContract = contracts_old.PosDelegateContract;
module.exports.PosUndelegateContract = contracts_old.PosUndelegateContract;
module.exports.PosTransferContract = contracts_old.PosTransferContract;
module.exports.PosGetRewardContract = contracts_old.PosGetRewardContract;

module.exports.PoolCreateContract = contracts_old.PoolCreateContract;
module.exports.PoolLiquidityAddContract = contracts_old.PoolLiquidityAddContract;
module.exports.PoolLiquidityRemoveContract = contracts_old.PoolLiquidityRemoveContract;
module.exports.PoolLiquiditySellExactContract = contracts_old.PoolLiquiditySellExactContract;
module.exports.PoolLiquidityBuyExactContract = contracts_old.PoolLiquidityBuyExactContract;
module.exports.PoolLiquiditySellExactRoutedContract = contracts_old.PoolLiquiditySellExactRoutedContract;
module.exports.PoolLiquidityBuyExactRoutedContract = contracts_old.PoolLiquidityBuyExactRoutedContract;

module.exports.FarmCreateContract = contracts_old.FarmCreateContract;
module.exports.FarmIncreaseStakeContract = contracts_old.FarmIncreaseStakeContract;
module.exports.FarmDecreaseStakeContract = contracts_old.FarmDecreaseStakeContract;
module.exports.FarmCloseStakeContract = contracts_old.FarmCloseStakeContract;
module.exports.FarmGetRewardContract = contracts_old.FarmGetRewardContract;
module.exports.FarmsAddEmissionContract = contracts_old.FarmsAddEmissionContract;

module.exports.DexCmdDistributeContract = DexCmdDistributeContract;
