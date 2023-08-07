/**
 * Node Trinity source code
 * See LICENCE file at the top of the source tree
 *
 * ******************************************
 *
 * Utils.js
 * Utility functions
 *
 * ******************************************
 *
 * Authors: K. Zhidanov, A. Prudanov, M. Vasil'ev
 */

const crypto = require('crypto');
const enq = require('./Enq');
const config = require('./config.json');
const rsasign = require('jsrsasign');
let rx = require('./node_modules/node-randomx/addon');
const fs = require('fs');

let KeyEncoder = require('key-encoder').default;
let keyEncoder = new KeyEncoder('secp256k1');

class ECC {
	constructor(mode) {
		if(mode === "short"){
			this.a = enq.BigNumber(25);
			this.b = enq.BigNumber(978);
			this.p = enq.BigNumber(1223);
			this.order = enq.BigNumber(1183);
			this.g0x = enq.BigNumber(972);
			this.g0y = enq.BigNumber(795);
			this.gx = enq.BigNumber(1158);
			this.gy = enq.BigNumber(92);
			this.curve = enq.Curve(this.a, this.b, this.p, this.order, this.g0x, this.g0y);
			this.G0 = enq.Point(this.g0x, this.g0y, this.curve);
			this.G = enq.Point(this.gx, this.gy, this.curve);
			this.MPK = enq.Point(enq.BigNumber(512), enq.BigNumber(858), this.curve);
		}
		else{
			this.a = 	enq.BigNumber(1);
			this.b = 	enq.BigNumber(0);
			this.p = 	enq.BigNumber("80000000000000000000000000000000000200014000000000000000000000000000000000010000800000020000000000000000000000000000000000080003");
			this.order = enq.BigNumber("80000000000000000000000000000000000200014000000000000000000000000000000000010000800000020000000000000000000000000000000000080004");
			this.g0x = 	enq.BigNumber("2920f2e5b594160385863841d901a3c0a73ba4dca53a8df03dc61d31eb3afcb8c87feeaa3f8ff08f1cca6b5fec5d3f2a4976862cf3c83ebcc4b78ebe87b44177");
			this.g0y = 	enq.BigNumber("2c022abadb261d2e79cb693f59cdeeeb8a727086303285e5e629915e665f7aebcbf20b7632c824b56ed197f5642244f3721c41c9d2e2e4aca93e892538cd198a");

			this.G0_fq = {
				"x" : "1 1971424652593645857677685913504949042673180456464917721388355467732670356866868453718540344482523620218083146279366045128738893020712321933640175997249379 4296897641464992034676854814757495000621938623767876348735377415270791885507945430568382535788680955541452197460367952645174915991662132695572019313583345",
				"y" : "1 5439973223440119070103328012315186243431766339870489830477397472399815594412903491893756952248783128391927052429939035290789135974932506387114453095089572 3254491657578196534138971223937186183707778225921454196686815561535427648524577315556854258504535233566592842007776061702323300678216177012235337721726634"
			};
			this.curve = enq.Curve(this.a, this.b, this.p, this.order, this.g0x, this.g0y);
			this.strIrred = "2 1 1 6703903964971298549787012499102923063739684112761466562144343758833001675653841939454385015500446199477853424663597373826728056308768000892499915006541826";
			this.strA = "0 1";
			this.strB = "0 0";
			this.e_fq = enq.Curve_Fq(this.p.decString(), 2, this.strIrred, this.strA, this.strB);
		}
	}
}

function apiRequest(options){
    let request = require('request');
    return new Promise(function(resolve, reject){
        request(options, (err, res, body) => {
            if (err) {
                return reject(new Error('apiRequest error : ' + err));
            }
            if(!body)
                return resolve(null);
            if(options.method === 'GET')
                try {
                    body = JSON.parse(body);
                }
                catch (err) {
            		console.error(`body is not JSON: ${body}`);
                    return reject(new Error('apiRequest parse error : ' + err));
                }
            return resolve(body);
        });
    });
}

let utils = {
	ENQ_TOKEN_NAME : config.native_token_hash,
	TX_STATUS : {
		DUPLICATE : 1,
		REJECTED  : 2,
		CONFIRMED : 3
	},
	MAX_SUPPLY_LIMIT : BigInt('18446744073709551615'),
	PERCENT_FORMAT_SIZE : BigInt(10000),
	FARMS_LEVEL_PRECISION : BigInt('10000000000000000000'),
	DEX_COMMANDER_ADDRESS : config.dex.DEX_COMMANDER_ADDRESS,
	DEX_BURN_ADDRESS : config.dex.DEX_BURN_ADDRESS,
	DEX_ENX_TOKEN_HASH : config.dex.DEX_ENX_TOKEN_HASH,
	DEX_SPACE_STATION_ID : config.dex.DEX_SPACE_STATION_ID,
	DEX_COMMANDER_FEE : BigInt(config.dex.DEX_COMMANDER_FEE),
	DEX_POOL_FEE : BigInt(config.dex.DEX_POOL_FEE),
	MINER_INTERVAL : 1000,
	M_ROOT_RESEND_INTERVAL : 3000,
	POS_MINER_RESEND_INTERVAL : 30000,
	MINER_CHECK_TARGET_INTERVAL : 100,
	MAX_COUNT_NOT_COMPLETE_BLOCK : 200,
	PID_TIMEOUT : 10, //sec
	SYNC_CHUNK_SIZE : 1000000, //byte
	SYNC_FAILURES_LIMIT : 5,
	SYNC_IGNORE_TIMEOUT : 7200000, //ms  2 hours
	MAX_NONCE : 2147483647, //Maximum Value Signed Int
    ...config.bridge,

    pid_cached : 0,
	lastTime : Date.now(),
	lastInput : 0,
	lastError : 0,
	ITerm : 0,
	ki : 0.01,
	kp : 16777215 * 0.5, //
	kd : 16777215 * 0.1,

	outMax : 16777215 * 2,
	outMin : 16777215 * -2,
	ecdsa_verify : function(cpkey, sign, msg){
		try{
			let sign_buf = Buffer.from(sign, 'hex');
			let pkey = crypto.ECDH.convertKey(cpkey, 'secp256k1', 'hex', 'hex', 'uncompressed');
			let pemPublicKey = keyEncoder.encodePublic(pkey, 'raw', 'pem');

			const verify = crypto.createVerify('SHA256');
			verify.update(msg);
			verify.end();
			return verify.verify(pemPublicKey, sign_buf);
		}
		catch(err){
			console.error("Verification error: ", err);
			console.error({sign});
			return false;
		}
	},
	ecdsa_verify_jsrsasign : function(cpkey, sign, msg){
		let sig = new rsasign.Signature({ "alg": 'SHA256withECDSA' });
		try {
			let pkey;
			pkey = crypto.ECDH.convertKey(cpkey, 'secp256k1', 'hex', 'hex', 'uncompressed');
			sig.init({ xy: pkey, curve: 'secp256k1' });
			sig.updateString(msg);
			return sig.verify(sign);
		}
		catch(err){
			console.error("Verification error: ", err);
			return false;
		}
	},
	ecdsa_sign : function(skey, msg){
		let sig = new rsasign.Signature({ "alg": 'SHA256withECDSA' });
		try {
			sig.init({ d: skey, curve: 'secp256k1' });
			sig.updateString(msg);
			return sig.sign();
		}
		catch(err){
			console.error("Signing error: ", err);
			return null;
		}
	},
	ecdsa_sign_crypto : function(skey, msg){
		const sign = crypto.createSign('sha256');
		try {
			let pemPrivateKey = keyEncoder.encodePrivate(skey, 'raw', 'pem');
			sign.write(msg);
			sign.end();
			return sign.sign(pemPrivateKey, 'hex');
		}
		catch(err){
			console.error("Signing error: ", err);
			return null;
		}
	},
	get_channel_id : function(lock_data) {
        const model = ["dst_address", "dst_network", "src_address", "src_hash"]
        let valuesFromObject = model.map(lock_param => lock_data[lock_param])
        return crypto.createHash('sha256').update(valuesFromObject.sort().join("")).digest('hex')
    },
	get_transfer_id : function(ticket){
		let param_names = ["dst_address", "dst_network", "nonce", "src_address", "src_hash", "src_network"];
		let params_str = param_names.map(v => crypto.createHash('sha256').update(ticket[v].toString().toLowerCase()).digest('hex')).join("");
		let transfer_id = crypto.createHash('sha256').update(params_str).digest('hex');
		return transfer_id;
	},
	check_valid_percent_params : function(param_obj){
		let len = Object.keys(param_obj).length;
		if(len < 1)
			return false;

		let sum = BigInt(0);
		for(let i = 0; i < len; i++){
			let value = Object.values(param_obj)[i];
			const parsed = parseInt(value, 10);
  			if (isNaN(parsed) || parsed < 0)
  				return false;
  			sum += BigInt(parsed);
		}
		return sum === this.PERCENT_FORMAT_SIZE;

	},
    genKeys : function(){
        const bob = crypto.createECDH('secp256k1');
        bob.generateKeys();
        return {
            prvkey : bob.getPrivateKey().toString('hex'),
            pubkey : bob.getPublicKey('hex', 'compressed')
        };
    },
	format_time(hrtime, points){
		return ((hrtime[0]*1e9 + hrtime[1])/1e9).toFixed(points || 6);
	},
	compareBlocksByHash(a, b) {
		if (a.hash < b.hash) return -1;
  		return a.hash > b.hash ? 1 : 0;
	},
	hash_kblock : function(kblock, vm){
		if (!kblock)
			return undefined;

		let str = ['time','link','publisher','nonce','m_root'].map(v => crypto.createHash('sha256').update(kblock[v].toString().toLowerCase()).digest('hex')).join("");
		let blob = crypto.createHmac('sha256', '').update(str).digest().toString('hex');
		let hash = rx.hash(vm, blob);

		return Buffer.from(hash, "hex");
	},
	hash_mblock : function(block){
		let txs_hash = crypto.createHash('sha256').update(block.txs.map(tx => this.get_txhash(tx)).sort().join("")).digest('hex');
		return crypto.createHash('sha256').update(block.kblocks_hash.toLowerCase() + block.nonce.toString() + block.publisher.toLowerCase() + txs_hash.toLowerCase()).digest('hex');
	},
	hash_sblock : function(sblock){
		if (!sblock)
			return undefined;
		let str = ['bulletin','kblocks_hash','publisher','sign'].map(v => crypto.createHash('sha256').update(sblock[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHmac('sha256', '').update(str).digest();
	},
	hash_tx : function(tx){
		if (!tx)
			return undefined;
		let str = ['amount','from','nonce','sign','to'].map(v => crypto.createHash('sha256').update(tx[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_snapshot : function(snapshot, height){
		let ledger_accounts_hash = crypto.createHash('sha256').update(snapshot.ledger.map(account => this.hash_ledger(account)).sort().join("")).digest('hex');
		let tokens_hash = crypto.createHash('sha256').update(snapshot.tokens.map(token => this.hash_token(token)).sort().join("")).digest('hex');
		let poses_hash = crypto.createHash('sha256').update(snapshot.poses.map(pos => this.hash_pos(pos)).sort().join("")).digest('hex');
		let delegates_hash = crypto.createHash('sha256').update(snapshot.delegates.map(delegate => this.hash_delegated(delegate)).sort().join("")).digest('hex');
		let undelegates_hash = crypto.createHash('sha256').update(snapshot.undelegates.map(undelegate => this.hash_undelegated(undelegate, height)).sort().join("")).digest('hex');
		let dex_pools_hash = "";
		let farms_hash = "";
		let farmers_hash = "";
        let minted = "";
        let bridge_claim_transfers = "";
        let bridge_lock_transfers = "";
        let bridge_confirmations = "";
        let bridge_settings = "";
		if (height >= config.FORKS.fork_block_002) {
			dex_pools_hash = crypto.createHash('sha256').update(snapshot.dex_pools.map(dex_pool => this.hash_dex_pool(dex_pool)).sort().join("")).digest('hex');
			farms_hash = crypto.createHash('sha256').update(snapshot.farms.map(farm => this.hash_farm(farm)).sort().join("")).digest('hex');
			farmers_hash = crypto.createHash('sha256').update(snapshot.farmers.map(farmer => this.hash_farmer(farmer)).sort().join("")).digest('hex');
		}
        if (height >= config.FORKS.fork_block_003) {
			minted = crypto.createHash('sha256').update(snapshot.minted.map(m => this.hash_minted(m)).sort().join("")).digest('hex');
            bridge_claim_transfers = crypto.createHash('sha256').update(snapshot.bridge_claim_transfers.map(transfer => this.hash_bridge_claim_transfers(transfer)).sort().join("")).digest('hex');
            bridge_lock_transfers = crypto.createHash('sha256').update(snapshot.bridge_lock_transfers.map(transfer => this.hash_bridge_lock_transfers(transfer)).sort().join("")).digest('hex');
            bridge_confirmations = crypto.createHash('sha256').update(snapshot.bridge_confirmations.map(confirmation => this.hash_confirmations(confirmation)).sort().join("")).digest('hex');
            bridge_settings = crypto.createHash('sha256').update(snapshot.bridge_settings.map(bs => this.hash_bridge_settings(bs)).sort().join("")).digest('hex');
        }
		return crypto.createHash('sha256').update(snapshot.kblocks_hash.toLowerCase() +
			ledger_accounts_hash.toLowerCase() +
			tokens_hash.toLowerCase() +
			poses_hash.toLowerCase() +
			delegates_hash.toLowerCase() +
			undelegates_hash.toLowerCase() +
			dex_pools_hash.toLowerCase() +
			farms_hash.toLowerCase() +
			farmers_hash.toLowerCase() +
            minted.toLowerCase() +
            bridge_claim_transfers.toLowerCase() +
            bridge_lock_transfers.toLowerCase() +
            bridge_confirmations.toLowerCase() +
            bridge_settings.toLowerCase()).digest('hex');
	},
    hash_fields : function(row, fields) {
		if (!row)
			return undefined;
		let str = fields.map(v => crypto.createHash('sha256').update(row[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
    },
    hash_minted : function(minted) {
        let str = [
            'wrapped_hash', 
            'origin_network', 
            'origin_hash', 
            'origin_decimals'
        ];
        return this.hash_fields(minted, str);
    },
    hash_bridge_claim_transfers : function(transfer) {
        let str = [
            'nonce',
            'src_address',
            'dst_address',
            'src_network',
            'amount',
            'dst_network',
            'src_hash',
            'ticket_hash',
            'ticker',
            'origin_network',
            'origin_hash',
            'origin_decimals',
            'name'
        ];
        return this.hash_fields(transfer, str);
    },
    hash_bridge_lock_transfers: function(transfer) {
        let str = [
            'channel_id',
			`dst_address`,
			`dst_network`,
			`src_address`,
			`src_hash`,
            'nonce'
        ];
        return this.hash_fields(transfer, str);
    },
    hash_confirmations : function(confirmation) {
        let str = [
            'validator_id',
            'validator_sign',
            'ticket_hash'
        ];
        return this.hash_fields(confirmation, str);
    },
    hash_bridge_settings : function(bridge_settings) {
        let str = [
            'owner',
            'threshold',
            'validators',
            'known_networks'
        ];
        return this.hash_fields(bridge_settings, str);
    },
	hash_farm : function(farm){
		if (!farm)
			return undefined;
		let str = [	'farm_id', 'stake_token', 'reward_token', 'emission', 'block_reward', 'level', 'total_stake', 'last_block', 'accumulator'].map(v => crypto.createHash('sha256').update(farm[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_farmer : function(farmer){
		if (!farmer)
			return undefined;
		let str = [	'farm_id', 'farmer_id', 'stake', 'level'].map(v => crypto.createHash('sha256').update(farmer[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_dex_pool : function(dex_pool){
		if (!dex_pool)
			return undefined;
		let str = ['pair_id','asset_1','volume_1','asset_2','volume_2','pool_fee','token_hash'].map(v => crypto.createHash('sha256').update(dex_pool[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_token : function(token){
		if (!token)
			return undefined;
		//TODO: fix token[v] != undefined (minable, reissuable fields have `null` value in DB)
		let str = ['hash','owner','fee_type','fee_value','fee_min','ticker','decimals','total_supply','caption','active', 'max_supply',
			'block_reward',
			'min_stake',
			'referrer_stake',
			'ref_share',
			'reissuable',
			'minable'].map(v => crypto.createHash('sha256').update(token[v] != undefined ? token[v].toString().toLowerCase() : '').digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_pos : function(pos){
		if (!pos)
			return undefined;
		let str = ['id','owner','fee','name'].map(v => crypto.createHash('sha256').update(pos[v] != undefined ? pos[v].toString().toLowerCase() : '').digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_ledger : function(account){
		if (!account)
			return undefined;
		let str = ['id','amount','token'].map(v => crypto.createHash('sha256').update(account[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_delegated : function(delegate){
		if (!delegate)
			return undefined;
		let str = ['pos_id','delegator','amount','reward'].map(v => crypto.createHash('sha256').update(delegate[v].toString().toLowerCase()).digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	hash_undelegated : function(undelegate, height){
		if (!undelegate)
			return undefined;
		let str;
		if (height >= config.FORKS.fork_block_002)
			str = ['id','delegator','pos_id','amount','height'].map(v => crypto.createHash('sha256').update(undelegate[v] != undefined ? undelegate[v].toString().toLowerCase() : '').digest('hex')).join("");
		else
			str = ['id','pos_id','amount','height'].map(v => crypto.createHash('sha256').update(undelegate[v] != undefined ? undelegate[v].toString().toLowerCase() : '').digest('hex')).join("");
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	merkle_root_000 : function (mblocks, sblocks, snapshot_hash) {
		let acc = "";
		mblocks.sort(this.compareBlocksByHash);
		mblocks.forEach((mblock) => {
			acc = crypto.createHmac('sha256', '')
				.update(acc)
				.update(mblock.hash)
				.digest()
				.toString('hex');
		});
		if(sblocks)
			sblocks.sort(this.compareBlocksByHash);
			sblocks.forEach((sblock) => {
				acc = crypto.createHmac('sha256', '')
					.update(acc)
					.update(sblock.hash)
					.digest()
					.toString('hex');
			});
		if(snapshot_hash)
			acc = crypto.createHmac('sha256', '')
				.update(acc)
				.update(snapshot_hash)
				.digest()
				.toString('hex');
		return acc;
	},
	merkle_root_002 : function (mblocks, sblocks, snapshot_hash) {
		mblocks.sort(this.compareBlocksByHash);
		sblocks.sort(this.compareBlocksByHash);
		let m_root = this.merkle_tree(mblocks.map(m=> m.hash));
		let s_root = this.merkle_tree(sblocks.map(s=> s.hash));
		if(!snapshot_hash)
			snapshot_hash = '';
		return crypto.createHmac('sha256', '')
			.update(m_root)
			.update(s_root)
			.update(snapshot_hash)
			.digest()
			.toString('hex');
	},
	merkle_tree : function(array) {
		if (array.length === 1)
			return array[0];
		else {
			let new_arr = [];
			let j = 0;
			for (let i = 0; i < array.length; i=i+2) {
				new_arr[j] = this.merkle_node(array[i], ((i + 1) < array.length) ? array[i+1] : array[i]);
				j++;
			}
			return this.merkle_tree(new_arr);
		}
	},
	merkle_node : function(hash_a, hash_b) {
		return crypto.createHash('sha256').update(
			hash_a + hash_b
		).digest('hex');
	},
	get_txhash : function(tx){
		if (!tx)
			return undefined;
		let model = ['amount','data','from','nonce','sign','ticker','to'];
		let str;
		try{
			str = model.map(v => crypto.createHash('sha256').update(tx[v].toString().toLowerCase()).digest('hex')).join("");
		}
		catch(e){
			if (e instanceof TypeError) {
				console.info(tx);
				console.warn("Old tx format, skip new fields...");
				return undefined;
			}
		}
		return crypto.createHash('sha256').update(str).digest('hex');
    },
	// TODO: unnecessary function
	valid_sign_microblocks(mblocks){
		mblocks = mblocks.filter((mblock)=>{
			let signed_msg =  mblock.hash + (mblock.referrer ? (mblock.referrer) : "") + mblock.token;
			return this.ecdsa_verify(mblock.publisher, mblock.sign, signed_msg);
		});
		return mblocks;
	},
	leader_sign_000(LPoSID, leader_msk, mblock_data, ECC, cfg_ecc, debug_short, need_fail) {
		let msk = enq.BigNumber(leader_msk);

		let H, Q, m_hash;
		let secret, leader_sign;
		let weil_err = false;
		let verified = true;
		mblock_data.nonce = 0;

		if (cfg_ecc.ecc_mode === "short") {
			do {
				mblock_data.nonce = mblock_data.nonce + 1;
				//mblock_data.txs[0].nonce = mblock_data.txs[0].nonce + 1;
				m_hash = this.hash_mblock(mblock_data);
				console.silly(`recreating block, nonce = ${mblock_data.nonce}, m_hash = ${m_hash}`);

				let PK_LPoS = enq.getHash(mblock_data.kblocks_hash.toString() + LPoSID.toString() + mblock_data.nonce.toString());
				let H_hash = enq.getHash(m_hash.toString() + LPoSID.toString());
				H = enq.toPoint(parseInt(H_hash.slice(0, 5), 16), ECC.G, ECC.curve);
				Q = enq.toPoint(parseInt(PK_LPoS.slice(0, 5), 16), ECC.G, ECC.curve);
				if (!H.isInfinity(ECC.curve) && !Q.isInfinity(ECC.curve)) {
					secret = enq.mul(msk, Q, ECC.curve);
					leader_sign = enq.sign(m_hash, LPoSID, ECC.G, ECC.G0, secret, ECC.curve);
					weil_err = ((parseInt(H_hash.slice(0, 5), 16) % 13) === 7) && (leader_sign.r.x === 41) && (leader_sign.r.y === 164);
				}
			} while (need_fail ^ (H.isInfinity(ECC.curve) || Q.isInfinity(ECC.curve) || weil_err));
		} else {
			do {
				mblock_data.nonce = mblock_data.nonce + 1;
				//mblock_data.txs[0].nonce = mblock_data.txs[0].nonce + 1;
				m_hash = this.hash_mblock(mblock_data);
				console.silly(`recreating block, nonce = ${mblock_data.nonce}, m_hash = ${m_hash}`);
				let PK_LPoS = enq.getHash(mblock_data.kblocks_hash.toString() + LPoSID.toString() + mblock_data.nonce.toString());
				//Q = enq.toPoint(PK_LPoS, G, curve);
				let bnPK_LPoS = enq.BigNumber(PK_LPoS);
				let Q = enq.getQ(bnPK_LPoS, ECC.curve, ECC.e_fq);
				secret = enq.mul(msk, Q, ECC.curve);
				try {
					leader_sign = enq.sign_tate(m_hash, LPoSID, ECC.G0_fq, secret, ECC.curve, ECC.e_fq);
					//verified = enq.verify_tate(leader_sign, m_hash, PK_LPoS, G0_fq, MPK_fq, LPoSID, curve, e_fq);
				} catch (e) {
					console.error(e)
				}
			} while (need_fail ^ !verified);
		}
		return {m_hash, leader_sign};
	},
	leader_sign(leader_id, leader_msk, kblocks_hash, merkle_root, ECC, cfg_ecc, debug_short, need_fail) {
		let LPoSID = leader_id;

		let msk = enq.BigNumber(leader_msk);

		let H, Q, m_hash;
		let secret, leader_sign;
		let weil_err = false;
		let verified = true;
		// mblock_data.nonce = 0;

		if (cfg_ecc.ecc_mode === "short") {
			do {
				let PK_LPoS = enq.getHash(kblocks_hash.toString() + LPoSID.toString());
				let H_hash = enq.getHash(merkle_root.toString() + LPoSID.toString());
				H = enq.toPoint(parseInt(H_hash.slice(0, 5), 16), ECC.G, ECC.curve);
				Q = enq.toPoint(parseInt(PK_LPoS.slice(0, 5), 16), ECC.G, ECC.curve);
				if (!H.isInfinity(ECC.curve) && !Q.isInfinity(ECC.curve)) {
					secret = enq.mul(msk, Q, ECC.curve);
					leader_sign = enq.sign(merkle_root, LPoSID, ECC.G, ECC.G0, secret, ECC.curve);
					weil_err = ((parseInt(H_hash.slice(0, 5), 16) % 13) === 7) && (leader_sign.r.x === 41) && (leader_sign.r.y === 164);
				}
			} while (need_fail ^ (H.isInfinity(ECC.curve) || Q.isInfinity(ECC.curve) || weil_err));

		} else {
			do {
				//m_hash = Utils.hash_mblock(mblock_data);
				//console.silly(`recreating block, nonce = ${mblock_data.nonce}, m_hash = ${m_hash}`);
				let PK_LPoS = enq.getHash(kblocks_hash.toString() + LPoSID.toString());
				//Q = enq.toPoint(PK_LPoS, G, curve);
				let bnPK_LPoS = enq.BigNumber(PK_LPoS);
				let Q = enq.getQ(bnPK_LPoS, ECC.curve, ECC.e_fq);
				secret = enq.mul(msk, Q, ECC.curve);
				try {
					leader_sign = enq.sign_tate(merkle_root, LPoSID, ECC.G0_fq, secret, ECC.curve, ECC.e_fq);
					//verified = enq.verify_tate(leader_sign, m_hash, PK_LPoS, G0_fq, MPK_fq, LPoSID, curve, e_fq);
				} catch (e) {
					console.error(e)
				}
			} while (need_fail ^ !verified);
		}
		return leader_sign;
	},
	valid_leader_sign_000(mblocks, LPoSID, ECC, cfg_ecc){
		mblocks = mblocks.sort(this.compareBlocksByHash);
		let ecc_mode = cfg_ecc.ecc_mode;
		let mblock_data = mblocks[0];
		let PK_LPoS = enq.getHash(mblock_data.kblocks_hash.toString() + LPoSID.toString() + mblock_data.nonce.toString());
		let isValid = false;
		try{
			if(ecc_mode === "short"){
				let MPK = enq.Point(enq.BigNumber(cfg_ecc[ecc_mode].MPK.x), enq.BigNumber(cfg_ecc[ecc_mode].MPK.y), ECC.curve);
				isValid = enq.verify(mblock_data.leader_sign, mblock_data.hash, PK_LPoS, ECC.G, ECC.G0, MPK, LPoSID, ECC.p, ECC.curve);
			}
			else{
				isValid = enq.verify_tate(mblock_data.leader_sign, mblock_data.hash, PK_LPoS, ECC.G0_fq, cfg_ecc[ecc_mode].MPK, LPoSID, ECC.curve, ECC.e_fq);
			}
		}
		catch(e){
			console.error(e);
		}
		return isValid;
	},
	valid_leader_sign_002(kblock_hash, m_root, leader_sign, LPoSID, ECC, cfg_ecc){
		let ecc_mode = cfg_ecc.ecc_mode;
		let PK_LPoS = enq.getHash(kblock_hash.toString() + LPoSID.toString());
		let isValid = false;
		try{
			if(ecc_mode === "short"){
				let MPK = enq.Point(enq.BigNumber(cfg_ecc[ecc_mode].MPK.x), enq.BigNumber(cfg_ecc[ecc_mode].MPK.y), ECC.curve);
				isValid = enq.verify(leader_sign, m_root, PK_LPoS, ECC.G, ECC.G0, MPK, LPoSID, ECC.p, ECC.curve);
			}
			else{
				isValid = enq.verify_tate(leader_sign, m_root, PK_LPoS, ECC.G0_fq, cfg_ecc[ecc_mode].MPK, LPoSID, ECC.curve, ECC.e_fq);
			}
		}
		catch(e){
			console.error(e);
		}
		return isValid;
	},
	valid_full_microblocks_000(mblocks, accounts, tokens, check_txs_sign){
		let total_tx_count = 0;
		mblocks = mblocks.filter((mblock)=>{
			let tok_idx = tokens.findIndex(t => t.hash === mblock.token);
			if(tok_idx < 0){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} : token not found`);
				return false;
			}
			if(tokens[tok_idx].minable !== 1){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} : token not minable`);
				return false;
			}
			let pub = accounts.findIndex(a => ((a.id === mblock.publisher) && ((a.token === mblock.token))));
			if (pub < 0){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} : publisher not found`);
				return false;
			}
			if ((accounts[pub].amount < tokens[tok_idx].min_stake)){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} due to low stake`);
				return false;
			}

			let recalc_hash = this.hash_mblock(mblock);
			let signed_msg = recalc_hash + (mblock.referrer ? (mblock.referrer) : "") + mblock.token;

			if(this.ecdsa_verify(mblock.publisher, mblock.sign, signed_msg)){
				console.trace(`mblock sign valid`);
				if (!check_txs_sign)
					return true;
				total_tx_count += mblock.txs.length;
				mblock.txs = mblock.txs.filter((tx)=>{
					let hash = this.hash_tx_fields(tx);
					if(!this.ecdsa_verify(tx.from, tx.sign, hash)){
						console.warn(`Invalid sign (${tx.sign}) tx ${hash}`);
						return false;
					}else
						return true;
				});
				if(mblock.txs.length === 0){
					console.warn(`Ignore empty mblock ${mblock.hash}`);
					return false;
				}
				return true;
			} else{
				console.warn(`Invalid sign mblock ${mblock.hash}`);
				return false;
			}
		});
		console.trace(`total tx count = ${total_tx_count}`);
		return mblocks;
	},
	locklist:[
		"03fd7ed9000c1c3bd65fdfed52a1136c59c39f966d3a315ee54c6ea2a93eb930ee"
	],
	blacklist : [
		"036808ae1adb7604b52345694723df6b09853e9e43105add144604d382951b0df5",
		"039099794d26438ceff314524d40f96003099ba4cd0b3419062f85df32792ee139",
		"033bf7f0aabfcc5150ca32edab63062f527a0bc47b71a1ba58759c8527dc6647fa",
		"03422ba778183fe11170f39034153343ae329c5f4781262588347b53e137cd8136",
		"039a2090d69ba1d09f3dbada9b8e1cc4d30ec3188d007fa43ee2199deb50f56e8a",
		"0283101404bec6696159d3fafc2bdd8c9a5e142735ce47cbd6d053a32fd0c4fd08",
		"03b75312c96e2dbaa107fdf449377bbd049dd27d3dfec7194371c059702a39ce01",
		"02218337ec2c7bebb92497244344e5660e11fd832135a47b0eb69b688623e91c1c",
		"03586a61df7b01c620cda8bd2a0a7f7b3089d17b76e942b498a51089cca38d63d5",

		//undelegate (claim hack)
		"0206934c24fda170b51281310a11cc1587d78d55fcd5e22491876fb164f6f16dee",
		"0294367cc9d2eae5fbc9271e5104136213f4f8b36cd03f63b7835f9a85aec823a9",
		"02dc21a50fadc2d66dd784692efa5dfdc2e69e1ad6155088ac526864873ee982a3",
		"036890a9b7b5572b610381386300c4fb835a0b1c2108fcab2162353b4bae71c9af",
		"0391037fbefd4e7a71a27ca5f2008042cbb8dedab7b3bfb138ac65fec8f22751bf",
		"03d46ec0006bf66a784af9c5f29a0a4f5de80c5e349b679a3149eaf65852e40d7d",
		"02fad8b91d9e7ec3cafd11546df3adcd9577a23ed174bdea36a2d503fa3366c908",
		"03a4060f1a40203713e6b391b750df8f7c41a7d34084913beaca4381bfd40151f1",
		"026e79b255a7a5886c6a81dc14904c31831a0d6a36ab2f0d1391bc06f742f9d84e",
		"020e760f58eb0ba53d7517acef3332c0f78a39dda066da0bb7161a3b1b3630f131",
		"03d9a938d7ef3b646c71334f9c14fe954abe85cae01652336ee215f913a37cc2bb",
		"031331bcd050b1e1d8b5dbc770a2dd2e6c44ba2b4acf0a501537ff3c863b8e746a",
		"02324b85a6f8a05d3212f28f42275223e7b03c48ef5587d6ab0d0d541e09dc50be",
		"026512816147cc781457eac95dec3ff35eda6403f69ff5081ff314ba3907265bfb",
		"0281ce542ee5fd23f377f065164ef04b367a6aec3ac05797fec6d23b344f60b43f",
		"02dcb93ae48e016b2a0305abd68c4a64435dc162bfbe2973b142d4591bdee08a1c",
		"0302af73c0ede484dc842c43eb7bf9aca26dd66fdbd7d55247e299b248bed80378",
		"03de6520cd5b6b9b8dd6c826d7ecd7e6b829e8dc6739e853501c3845f723c1916a",
		"03e611e2b8bdedf69539e6bdf7ee0c5b8179c924e35d9810fed544604b5c7ed183",
		"03f7c64cc644cbfb48bb66d8f3ff7d6ec350d08c7cf7245a66f563d77b36ec9e76",
		"032e3687525909c801aae874694924e8205bdc37a1b2f5ce6e6255a3b4f67f4818",
		"0347dc2501a1697c20ae5fcd8bc2cb32c8e03f033bd93877a9e566053ef03e7282",
		"0231100bf777dd07bb558736d763555c003602bc35f5a074b46002f096ffcff092",
		"029b0efcb63c879cd96fc205e39274d3566892a8955905a495114f9715fcfa4986",
		"0257d344b782b660d6bbdf2932f9d794e75648c9cf305fda4f5124993a94a9fbd0",
		"0281d328e2a2490b13a9cc6c33b35eb84687fff589160beb2011abd5df11b3dfec",
		"03cf7298e6d5bfe9cb1fae2a677bb5783461bbad0cc9afb08a7b49c41a5f747a1b",
		"038278626622adaaa64853544b56935c09ceb0e4ccf7a1122f8b32dfda93e42499",
		"03af8ed260689e06f13127cd71b690dcf53a29cd09ca22c9b4626db26a15f8907a",
		"02ba05073c7a22534bf66c1e6d1c7405d377ed7f4000d709e2f3495c696af6cd59",
		"023788153f6c968e96777fd71f07099080ab9af0818da1bb11250ef91c91aa7b17",
		"026a18ca6aa8e622e9e298322ad0be3233f841a665b9ca554b356417b9d625fc02",
		"0334caee702cc35fa727afab3340bfd8c9c4547677b3cefaea832079ab55c9baf2",
		"03740b18a94a99d861df4baf54a94a211b49ac00a0442740c2f4fb40590cd99295",
		"03e6e78e973bfe636894e7ca573b6439a5d4903084b00379a5049199d478dd6031",
		"031a23bb97820f921ce4d8ff885def1851ca7a3e2b5d4957944cda639e3f46c7a4",
		"0365545df28904ca881d3f7a57a525def3eb40ad54fbbea96964256036e7cc2f9c",
		"02de14db6384ec65105c77c45aa5baf6c117213872c0289bd122565d99869297ba",
		"02d360f8c6a7fd04867d0619924cbd4bf64e37b8373b9d9e3b611c40200664b7da",
		"02dbea30e61f6ce89f225b3a7c6d8965cbbfb26e2ec92d37c2126202cfa47c1765",
		"039b676b90163fbcb353c9e018fb9d120f51b82b5319d65760734c0582a73cdd75",
		"036bd1698eed8fca140673079a9d6cf862971bc1c89992c43161a4537d2ea1eb3e",
		"022822b1dc3f849dadf9ddba21d124ed0f808eff8622ef7618357644a2c62aa60d",
		"03cf56b87bca080c63deeb230028a77914b2860bd544f48ffac964b5e8b510c0a2",
		"036a7f7796434a8692850976b4dda2c6000fad2d5ec3fc04866fdcf3087d6df420",
		"03beb8f50f7490af25ea47f2bd2b7c817db5ce9f768eab020def1956b300a3ae5f",
		"038eb13479e4f7df64082fcfe1fdd5f46875ffeac19339c9fed73a74618821fb0d",
		"0289bfe9c11e3605953ab96a139639ac271c03c2f07c002094b84858bd089347aa",
		"03807fd334127bcbd4e38e1f85de8c1fb4914ccbf0efe6e1b5f0d2fa3e0794c873",
		"02e2c6625adb8137c5ce44bf19527e49b59a001f7171e3e8f5bcace0c8a35b8a8b",
		"02ff374661424daf69ad5e6e197a632370d96e7bf4de303e89eb3028021f26c924",
		"02e0577eeb354a8cd7a54ecff3cb96acb02de6afe878744ac833c01aa6087fa552",
		"033e444da1feb3ecd98881bfc39c45403f37a1326f0cb7815993f3dce8a8c266e8",
		"03fb676f43878d75d749eff2997cfdb8ce238af7dd415cd9ea07193fb4241cc38d",
		"0341b6b8887f0c263d37f06f5529511544af30ed3da5af1708e803ef6c17afed96",
		"037947336e4aefe629306884eaa157b9d7036d5b87ee95974dac1bb72037379bde",
		"03ae47edf62bcae3bf1a2600e3b1500dbd1d68a409b98ca2a639d42b11e7815702",
		"039e08ca5e27fa60507b75bb3dfc044ada2a37ccb6c587acbb43f9542c5befce3c",
		"03b158ab6dc9b5170e89542e8f24b32dae831e360ae5902f86557063369dd7ddca",
		"029269827f2abf1cd8a63eb1d965e5ce5b8af9f6847a9d3c1390bf45b252a81447",
		"028819d69b0c48a80dc1e1b56e00b09e875b87c4e397e413893b3449c33069f2c1",
		"02c3746e25287af6df2b122e48e2edde618130a823db983afaabd9e7e6fd50feb4",
		"02d4a6cce5659cdc5f3817aefb48c1e9115c55d4a10ae578340fe49f3585e2a470",
		"02c573a9583fd81979b2e5cbdeb23e0387d4c97dd53f047c2cbb67b962f1f80797",
		"0216629ecd740bfa8eb4e755820c3cae6ae6481ff3d4f0be738eac244d9641e7a9",
		"0269de036b7b6e9d9de0026920fc4d69a39c400bf9512be12df634a50cd70e0288",
		"024c56accc9a360438c4ac00a4dde7d3378745e82ce1412004a9425daffec92e92",
		"035bb7250a589516badb4bed95c7d68d91e5e33f3e81a82f7b8a605bad54cf6177",
		"02fa848ea3469e0ceb1c69376027abb82a80c9f756aaf7c7e0ea3a26d94953bff9",
		"035175fc2785e475243f9bf2341d47643d744129e8567ad2ff4b1e8284995161d6",
		"029fa9063cdd6c748ae8d4dc1b4888a7bb5f783114f12d4390d4da3213bd607e5c",
		"02d3af9262828fb8240e2bbc11eab29ecac50c3c1a8938446f37808f2d8f90851b",
		"029ec0c2c28d97a2fb94eaed2e809ca982cf0a42b1834ac39ff0607e4d25d668bf",
		"026ccc9858f8c37769c57f5714a2e5ee4bb89a9b022141bad1f298157949ddc04d",
		"032250662a12689ba563cbcca7eb35e53950229ed16bfe00c837bab0da3f27dcce",
		"02b00049f6ed09bb68be1e807fca21b6a6539359b43f5ce076e3871107bab02ed0",
		"034478a69859af04ce2727fb4c205762739d831e54aba0cb37855babb6b0e58f60",
		"0272e9b40719e9535b8c2cd70786a4471a84baad109a5af79c8c105b9537024c2d",
		"02d760f0fadf2c36e70a0c43b92068643e6b6aa797ee8106231e3386cff49dfebf",
		"02f9eb9f7b9f940e5147073cdade84ff4938a857fae8bedeb2b06e6f3ba539a267",
		"0214c438f115772837032fb3624e9d94eaf5fbd11ec468d1a7b4caf1fe93465cb5",
		"039d88833fd5e7590bfd577705aa246941dd2ab05a32d453a07c5c2ffb989f5600",
		"0348552b31c803a7550044cd856981c22f520d6c9649f0edbb222867369cba8453",
		"0369ed7a048749246763cb0940314d96f007e3b34af1b285b66222ef864229db37",
		"029906d692030cbc9869f5d3aa8d49b6a931058ac4a2a6ae48c066f728eb00b835",
		"0297e5c2c1e119e3ab47771dd9566efdb76413c71eeedfa8881d85d931963c2810",
		"03f4c8efd7d57de4a25ce583c7fbcf39c0b9f165fadc1be1821bb469f33871be54",
		"0298af8e175b0f412f2e440d926b910dfce0aa533af33db978d28d0e7fd227d1cd",
		"02e824159d568fb4f0087d7aa1bcb1dd5ffc15a52d2c2d6d325dbd147d3172857a",
		"038cf7476216ede61d7ea64a039f4fe0178fa14531b03c21be9f2f72dc295c540f",
		"0380f2eef3ecc24a3c984be23662367fdf96de58d7fd23621ca159bc99486a2928",
		"03734aea6858579b99f807e31d8c3093c6ff8cd72ed75a02ce8467fd4c2b49a65a",
		"03af5d8e6e3ab2b1d83d88eed815f35edde3bf89e1684d00dcee293ebe51031127",
		"0321c6c95a2d36e1aef9fef3ba6fd3a6b4c86eae90739ea8823b583b13d91f6e22",
		"03b6b0d11f29503ce1b2dc2970c40610d1e13b3a4c424d98d9b82dd3f7e5d7280f",
		"03b4df4b504f06d3fedc1113a1ff435c2f5718062e942a69eedc9cb0211978ee03",
		"038269772e9536a183ce11106ec163abc00a205fe48e82273e2ba20550721b233d",
		"02570363afb2d3e69043dbe84c9ee1aa1fbcfb6a24510101a9d8191b0ccb02f99d",
		"032a0bd74b9591b24173b9654b4fef227b1278e0683986c04b0e212c76d12a7fcb",
		"03900ab2037cd4d72ff8675a4a62e998e8ccf869fbe4eed312c06c8eaad4051082",
		"02dff9210f68826c9bf70dae428c988bda564b630e781cefe8b24f9ee8d5a2e295",
		"0348d6d962d64486be49c29408f41e1f177367831c9293882ec6f4770a92725495",
		"03dca06c9b2cec7f47d3ceb3c154c179b70b30d556e42b56d4f9efda09c734aeb7",
		"030261637fca99fedec1b4522597879db80db25fedd60abe5147d6dd65c84ffc9b",
		"02a74c393e66783d69ca014c0907eeb9461f7208ed3b7b426ba6001df0fe3a222b",
		"02f3028064fdd0b87b8b1abfdcac57847d8e3a463c19882c1186a924fdfed0db87",
		"02704ecc32a083e3692cbd178c4cd8f3fc558fa58630d5d71ab2f36cdf614b6315",
		"0219e927deedf19c83f6c55af8b36c98e73f043cecb7c2fee811aaf9e47c826d26",
		"03efed6082eddadd41242265922e8c85a6be34257e259e30071c304a5fe6b00cdd",
		"037f3042e2e18d131ffb9d47d10a03e26d48652ddbf5a982b6aefd48f476c8609f",
		"02d2c71b8661f1998224339882f0ee6a69381b1a246f0f3289da2e166b9638b9dd",
		"034056944b29ab55d47eac18b7de7846ca9afa473873dc68ada399abc5592000fe",
		"034ed20c3fd3d308917be2362239d02852c62aab246e8de9e66e4991fc263fda25",
		"02d80772cb085916d9888604fec52c1e1c0f9d64aeef585870f17fa71d5bd95b71",
		"02d07b4965e6dedcd9d36f3b8e1290d765c07c6d15109f69ed92e3557d69f5c757",
		"02c4ec4da0455779c8fbca6d4d080649a0972697c4cd4168c3a9a37711234fd52b",
		"03c586fc9d38e0918cfe9b883ed64a3d2cdd1681c044e2426b848a621173d28642",
		"02e3dd9d47f9e1589a1983d7481424b82e97d141d27154f9a2fe529320a9cba332",
		"03c7a12a17b897104df31c72b05d274a14f717e55dbcdb49cb463bea6712f82d26",
		"0274e70308b04dd6fc3b9b7641034431833ec016b41d20a72e90b6aa49f4cf83d5",
		"03546e9c167ee1f6eab3a887430a7663067d0a32f2bd7ac068377c5a90ad78d165",
		"0364a87995bf7a9a7fb96f6916944fb7cd031e917ec3241875c927a6514ff8adf2",
		"02bd1d88c4c376d202a3e67f7600bae74b03d606bdd11ccac2c6aaab7cceeee2c2",
		"03f77fbf707a7d42359148613a35077fc086cb1d5d4f49a8dca406431357493207",
		"03730f1ad1dfe471c0e73ef4155d95e52ed5b2d2ea59b0f5b4dbbb9ddf39579ac7",
		"02c6885809834d510f7df37e50a3d3a337d8e4768a8952827441a2a5424fbdd090",
		"03830a1392e1d68c0f0b2abbd8312927cccdcce1c5add126fbde6be9360264ad8a",
		"02f34497be883ecf2ba31f3b134b8be1326a4a1c69eadafb4843e448baba438445",
		"032c756651fa28e9beb5ad1b37150a73c32263790814d04725381be5222af27fd5",
		"038a74a81506b0c787156e70022c7de47e7b115242dcf4e29f06de41282ebb1d05",
		"02e3b1e0b84f0cceb27227aee23552774813918956bf27fc4937434049f7a2f799",
		"0363da84f9c87f4308789732f617062f8cd82817483bf5ec90550b0ee1f838f944",
		"02c251e46232f6f52ad6f42f7a9af2f2025626c07cfa99240417b5c9cabae11cd4",
		"02ea926298d224f896a80ca8b60f176e4b37519e8275ca87f51e1f759c6a5f7024",
		"025c5a831177ef0041fa244d5dd9f53f986b467d7bacfb13e1e66ca2d306b4aa31",
		"0284f85b5147aa4e224fecc4f6459a2db9ea6f6f4404a12759911711edf59c3b72",
		"037d5f6cf3d79edb21749001e12127124016ae8bf6ab532709f228741fd70f97fe"
	],

	valid_full_microblocks(mblocks, accounts, tokens, check_txs_sign){
		let total_tx_count = 0;
		mblocks = mblocks.filter((mblock)=>{
			let tok_idx = tokens.findIndex(t => t.hash === mblock.token);
			if(tok_idx < 0){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} : token not found`);
				return false;
			}
			if(tokens[tok_idx].minable !== 1){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} : token not minable`);
				return false;
			}
			let pub = accounts.findIndex(a => ((a.id === mblock.publisher) && ((a.token === mblock.token))));
			if (pub < 0){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} : publisher not found`);
				return false;
			}
			if ((accounts[pub].amount < tokens[tok_idx].min_stake)){
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} due to low stake`);
				return false;
			}
			let regexAddress = /^(02|03)[0-9a-fA-F]{64}$/
			if (mblock.referrer != undefined && !regexAddress.test(mblock.referrer)) {
				console.trace(`ignoring mblock ${JSON.stringify(mblock)} referrer not correct`);
				return false;
			}

			mblock.txs = mblock.txs.filter((tx)=>{
				let hash = this.hash_tx_fields(tx);
				if(!this.ecdsa_verify(tx.from, tx.sign, hash)){
					console.warn(`Invalid sign (${tx.sign}) tx ${hash}`);
					return false;
				}else
					return true;
			});

			let recalc_hash = this.hash_mblock(mblock);
			let signed_msg = recalc_hash + (mblock.referrer ? (mblock.referrer) : "") + mblock.token;

		 	if(this.ecdsa_verify(mblock.publisher, mblock.sign, signed_msg)){
		 		console.trace(`mblock sign valid`);
		 		if (!check_txs_sign)
		 		    return true;
		 		total_tx_count += mblock.txs.length;
				if(mblock.txs.length === 0){
					console.warn(`Ignore empty mblock ${mblock.hash}`);
					return false;
				}
				return true;
			} else{
				console.warn(`Invalid sign mblock ${mblock.hash}`);
				return false;
			}
		});
		console.trace(`total tx count = ${total_tx_count}`);
		return mblocks;
	},
	valid_full_statblocks(sblocks, pos_stakes, pos_min_stake, top_poses) {
		return sblocks.filter(s => {
			let pub = pos_stakes.findIndex(a => a.pos_id === s.publisher);
			if (pub > -1) {
				if(!top_poses.some(a => pos_stakes[pub].pos_id === a.pos_id)){
					console.trace(`ignoring sblock ${JSON.stringify(s)} contract is not in top poses`);
					return false;
				}
				if (pos_stakes[pub].self_del >= pos_min_stake) {
					return true;
				} else {
					console.trace(`ignoring sblock ${JSON.stringify(s)} due to low stake`);
					return false;
				}
			} else {
				console.trace(`ignoring sblock ${JSON.stringify(s)} contract not found`);
				return false;
			}
		});
	},
    exist_native_token_count(mblocks){
		return (mblocks.filter(m => m.token === this.ENQ_TOKEN_NAME)).length;
    },
	hash_tx_fields : function(tx){
		if (!tx)
			return undefined;
		let model = ['amount','data','from','nonce','ticker','to'];
		let str;
		try{
			str = model.map(v => crypto.createHash('sha256').update(tx[v].toString().toLowerCase()).digest('hex')).join("");
		}
		catch(e){
			if (e instanceof TypeError) {
				console.warn("Old tx format, skip new fields...");
				return undefined;
			}
		}
		return crypto.createHash('sha256').update(str).digest('hex');
	},
	slice_tx_data : function(datastr){
		if (typeof datastr === 'string')
			return datastr.match(/.{1,256}/g);
		else return null;
	},
	/**
	 * @return {number}
	 */
	PID : function(input, last_input, target_speed, ITerm){
		/*Compute all the working error variables*/
		let error = target_speed - input;
		let last_error = target_speed - last_input;
		//ITerm+= (ki * error);
		if( ITerm > this.outMax)  ITerm = this.outMax;
		else if( ITerm < this.outMin)  ITerm = this.outMin;

		let dInput = (error - last_error) ;// / timeChange;
		/*Compute PID Output*/
		let output = this.kp * error +  ITerm + this.kd * dInput;

		if(output > this.outMax) output = this.outMax;
		else if(output < this.outMin) output = this.outMin;

		return output;
	},
	difficulty_met : function(h, current_difficulty) {
	 	return this.difficulty(h) >= current_difficulty;
	},
	difficulty : function(h){
		let count = 0; //count of zeros bit at the beginning
		let i = 0;
		let bit = 0;
		do {
			bit = ((h[i/8|0]) & (1 << (7 - (i%8)))) >> (7 - (i%8));
			count += !(bit);
			i++;
		} while (!bit);

		let result = count;
		const diff_bits_count = 32;
		let shift = count % 8;
		shift++;

		for(let j = 0; j < 3 ;j++)
		{
			result = result <<8;
			let tmp = (h[ (i / 8 | 0) + j] << shift | h[(i / 8| 0) + 1 + j ] >>> (8 - shift)) & 255;
			result = result | tmp;
		}
		return result;
	},
	calc_difficulty : async function(db, target_speed, kblock) {
		let data_delta_time_1 = await db.get_time_delta_kblock(kblock.hash, this.MINER_CHECK_TARGET_INTERVAL);
		let data_delta_time_2 = await db.get_time_delta_kblock(kblock.link, this.MINER_CHECK_TARGET_INTERVAL);
		if (data_delta_time_1 === undefined || data_delta_time_2 === undefined) {
			console.trace("undefined time delta kblock");
			return 0;
		}
		let delta_time_1 = Number(data_delta_time_1['time']) / Number(this.MINER_CHECK_TARGET_INTERVAL);
		let delta_time_2 = Number(data_delta_time_2['time']) / Number(this.MINER_CHECK_TARGET_INTERVAL);

		let data = await db.get_avg_diff_kblock(kblock.hash, this.MINER_CHECK_TARGET_INTERVAL);
		let avg_diff_1 = Number(data['avg_diff']);
		let iterm_res = await db.get_iterm(kblock.hash, this.ki, this.MINER_CHECK_TARGET_INTERVAL);
		let diff_offset = this.PID(delta_time_1, delta_time_2, target_speed,  Number(iterm_res['iterm']));
		let difficulty = avg_diff_1 + diff_offset;

		console.trace(`Recalc target difficulty = ${(this.understandable_difficulty(difficulty)).toFixed(2)}`);
		if (difficulty < 0) {
			console.warn(`Incorrect calc difficulty. Difficulty value: ${difficulty}, delta_time: ${delta_time_1}, avg_diff: ${avg_diff_1}, diff_offset: ${diff_offset}`);
			difficulty = 0;
		}
		return difficulty;
	},
	calc_fee(tokendata, amount){
		amount = BigInt(amount);
		if(tokendata.fee_type === 0)
			return BigInt(tokendata.fee_value);
		if(tokendata.fee_type === 1){
			if(amount <= tokendata.fee_min)
				return BigInt(tokendata.fee_min);
			let fee =  amount / (this.PERCENT_FORMAT_SIZE + BigInt(tokendata.fee_value)) * BigInt(tokendata.fee_value);
			//fee = Number(fee);
			if(fee < tokendata.fee_min)
				return BigInt(tokendata.fee_min);
			return fee;
		}
		if(tokendata.fee_type === 2){
			return BigInt(0);
		}
	},
	understandable_difficulty : function(int32){
		let ceil = (int32 >> 24);
		let div = int32 - (ceil<<24);
		return  ceil + (div / 16777215);
	},
	blocks_equal : function(v1, v2, vm){
		return Buffer.compare(this.hash_kblock(v1, vm), this.hash_kblock(v2, vm)) === 0;
	},
	coincidence : function (a, b, vm) {
		if ((a.constructor !== Array) || (b.constructor !== Array))
			console.warn('Parameter is not array');
		for (let i = 0; i < a.length; i++){
			for (let j = 0; j < b.length; j++){
				if (this.blocks_equal(a[i], b[j], vm) === true){
					return true;
				}
			}
		}
		return false;
	},
	ecc_get_session_keyshare : function(PK_LPoS, keypart, curveFp, curveFpm){
		PK_LPoS = enq.BigNumber(PK_LPoS);
		let Q = enq.getQ(PK_LPoS, curveFp, curveFpm);
		let ss = enq.mul(keypart, Q, curveFp);
		return ss;
	},
	ecc_key_recovery : function(proj, coalition, q1, PK_LPoS, curveFp, curveFpm){
		PK_LPoS = enq.BigNumber(PK_LPoS);
		let Q = enq.getQ(PK_LPoS, curveFp, curveFpm);
		let secret = enq.keyRecovery(proj, coalition, q1, curveFp);
		return secret;
	},
    http : {
        get : function(url, data){
            let options = {
                method:  'GET',
                url: url,
                qs : data
            };
            return apiRequest(options)
        },
        post : function(url, data){
            let options = {
                method:  'POST',
                url: url,
                body: data,
                json: true
            };
            return apiRequest(options)
        }
    },
	sleep : function(ms){
		return new Promise(function(resolve, reject){
			setTimeout(() => resolve(), ms)
		});
	},
	JSON_stringify : function(data){
		return JSON.stringify(data, (key, value) =>
						            typeof value === 'bigint'
						                ? value.toString()
						                : value // return everything else unchanged
		);
	},
	load_snapshot_from_file(path){
		let snapshot = undefined;
		try {
			snapshot = JSON.parse(fs.readFileSync(path, 'utf8'));
		} catch (e) {
			console.info('No snapshot file found.', e);
		}
		return snapshot;
	},
	strToFloat : function(input, decimals=10, fixed=10) {
		if(typeof input === 'string') {
			let str = BigInt(input).toString();
			let integerPart = '0';
			let fractionalPart = '0';
			let delimiter = decimals !== 0 ? (fixed !== 0 ? '.' : '') : '';
			if (str.length > decimals) {
				integerPart = BigInt(str.substring(0, str.length - decimals)).toString();
				fractionalPart = str.substring(str.length - decimals);
			} else {
				fractionalPart = str.substring(str.length - decimals);
				for (let i = 0; i < (decimals - str.length); i++) {
					fractionalPart = '0' + fractionalPart;
				}
			}
			return integerPart + delimiter + fractionalPart.substring(0, fixed);
		}
		else return '';
	},
	getPairId : function(asset_1, asset_2){
		if(BigInt(`0x${asset_1}`) < BigInt(`0x${asset_2}`))
			return {
				pair_id : `${asset_1}${asset_2}`,
				asset_1 : asset_1,
				asset_2 : asset_2
			};
		else return {
			pair_id : `${asset_2}${asset_1}`,
			asset_1 : asset_2,
			asset_2 : asset_1
		};
	},
	sqrt : function(value) {
		if (value < BigInt(0)) {
			throw 'square root of negative numbers is not supported'
		}
		if (value < BigInt(2)) {
			return value;
		}
		function newtonIteration(n, x0) {
			const x1 = ((n / x0) + x0) >> BigInt(1);
			if (x0 === x1 || x0 === (x1 - BigInt(1))) {
				return x0;
			}
			return newtonIteration(n, x1);
		}
		return newtonIteration(value, BigInt(1));
	}
};


module.exports = utils;
module.exports.ECC = ECC;
