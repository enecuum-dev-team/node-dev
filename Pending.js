const crypto = require('crypto');
const Utils = require('./Utils');
const ContractMachine = require('./SmartContracts');

let rich_ones = [
	{
		"prvkey": "b00f9d0b7548f7cb78466653886a186f890b2f303c8ea3cb5270c3abc92c366f",
		"pubkey": "03fbeb2e817c0e52b07a438b00d207940680d4a498b65b79f5b9e4d813b1bdc399"
	},
	{
		"prvkey": "715cad46c981c61d63fb3cddd1d374fec4cf937e28fbbb2692117f5e66fc6444",
		"pubkey": "03416144b39d982f9b9131b43fed2e75accddc26421b49230646bd316f96915348"
	},
	{
		"prvkey": "3b17bf1a599eab1f7199a9db895a5a6164b6eb881315976cff7d70ee1b22b1de",
		"pubkey": "027c82fc4bb4c43a6016eba87e43dc927fedd222c344ac6bc002a6275f257d5a9e"
	}
];

class Pending {
	constructor(db){
		this.db = db;
	}

	id() {
		return rich_ones[Math.floor(Math.random() * rich_ones.length)].pubkey;
	}

	async get_txs(count, timeout_s, enable_random){
		let txs = await this.db.pending_peek(count, timeout_s);
		if (enable_random) {
			let rnd = this.get_random_txs(count - txs.length);
			return rnd.concat(txs);
		} else {
			return txs;
		}
	}

	get_random_txs(count){
		let txs = [];
		for(let i = 0; i < count; i++){
			let alice = rich_ones[Math.floor(Math.random()*rich_ones.length)];
			let bob = rich_ones[Math.floor(Math.random()*rich_ones.length)];
			let tx = {
				"amount": Math.floor(Math.random()*300),
				"data": crypto.randomBytes(32).toString('hex'),
				"from": alice.pubkey,
				"nonce": Math.floor(Math.random()*300),
				"ticker": Utils.ENQ_TOKEN_NAME,
				"to": bob.pubkey
			};
			tx.sign = crypto.createHmac('sha256', Math.random().toString()).digest('hex');
			//tx.sign = ecdsa_sign(alice.prvkey, Utils.get_txhash(tx));
			tx.hash = Utils.get_txhash(tx);
			txs.push(tx)
		}
		return txs;
	}

	validate(tx){
		let isValid = Validator.tx(tx);
		if(isValid.err !== 0){
			console.trace(isValid);
			return isValid;
		}
		let hash = Utils.hash_tx_fields(tx);
		let verified = Utils.ecdsa_verify(tx.from, tx.sign, hash);
		console.silly(`Signed message: ${hash} , verified: ${verified}`);

		if (!verified) {
			console.warn('verification failed for transaction: ', JSON.stringify(tx));
			return {err: 1, message: "Signature verification failed"};
		}
		if(ContractMachine.isContract(tx.data)){
			if(!ContractMachine.validate(tx.data)){
				console.warn('Contract validation failed for transaction: ', JSON.stringify(tx));
				return {err: 1, message: "Contract validation failed"};
			}
		}
		return {err: 0};
	}

	async add_txs(tx){
		// todo: hash
		let result = await this.db.pending_add([tx]);
		return {err: 0, result : [{hash: tx.hash, status:0}]};
	}
}
let Validator = {
	txModel : ['amount','data','from','nonce','sign','ticker','to'],
	enq_regexp : /^(02|03)[0-9a-fA-F]{64}$/i,
	hash_regexp : /^[0-9a-fA-F]{64}$/i,
	digit_regexp : /^\d+$/,
	hex_regexp : /^[A-Fa-f0-9]+$/,
	name_regexp : /^[0-9a-zA-Z _]{0,512}$/,
	tx : function(tx){

		if(Array.isArray(tx))
			return {err: 1, message: "Only 1 TX can be sent"};

		if(this.txModel.some(key => tx[key] === undefined))
			return {err: 1, message: "Missed fields"};
		if(!this.enq_regexp.test(tx.from))
			return {err: 1, message: "FROM field in not a valid Enecuum address"};
		if(!this.enq_regexp.test(tx.to))
			return {err: 1, message: "TO field in not a valid Enecuum address"};
		if(!this.hash_regexp.test(tx.ticker))
			return {err: 1, message: "Incorrect ticker format, hash expected"};
		if(!((typeof tx.amount === 'string') || (typeof tx.amount === 'number')))
			return {err: 1, message: "Amount should be a string or a number"};
		if(!this.digit_regexp.test(tx.amount))
			return {err: 1, message: "Amount string should be a 0-9 digits only"};
		if(typeof tx.nonce !== 'number')
			return {err: 1, message: "Nonce should be a number"};
		if(!this.name_regexp.test(tx.data))
			return {err: 1, message: "Incorrect data format"};
		if(!this.hex_regexp.test(tx.sign))
			return {err: 1, message: "Incorrect sign format"};
		let amount;
		try{
			if(typeof tx.amount === 'string' && tx.amount.length <= 0)
				return {err: 1, message: "Amount is not a valid Integer"};
			amount = BigInt(tx.amount)
		}
		catch(err){
			return {err: 1, message: "Amount is not a valid Integer"};
		}
		if(amount < 0 || amount > Utils.MAX_SUPPLY_LIMIT)
			return {err: 1, message: "Amount is out of range "};
		if(tx.nonce < 0 || tx.nonce > Number.MAX_SAFE_INTEGER)
			return {err: 1, message: "Nonce is out of range "};

		return {err: 0};
	},
	txs : function(txs){
		return {err: 1, message: "Method not implemented yet"};
	}
};
module.exports = Pending;
module.exports.Validator = Validator;