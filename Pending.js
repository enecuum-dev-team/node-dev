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
	whitelist : [
		"02949a09b4deb8e5c363bff336bc38033eda5b22abdd933c56eb6293ffb38bb2e5",
		"02bdfcc38d5df4bdb0382e052e06366790ac246fc0c3ee2bce43527514504d4482",
		"02daaf7e458435026599bfdbed6526bb6645fad66c2735a27868112904c538dc1c",
		"02dad5b64ead359ae95345911feb9b5cb9683046eeafc621d6a4dd6ba451f0ce9c",
		"02db5fa148a77be645b3ceae71ec5e426d4f5c2e97b4da13807be5d2a9ba2bbc4f",
		"02f9bf380185f70e4c2d2afb1fcb7dd596f8a1098ee96d7d6f89ecb136ba33fb2f",
		"02fdc0d9b6f44fa3a431abbed8c5813293c3ac91113c793085c6c8fb3c2c929279",
		"030c4522d4ab27244fa782ea456f8db3ff7a7aea890dbd8405c15f5461b394ee21",
		"0327cebb351249388002bbb2a069d95210f79dcf0fac4a2edf6696f986e7ac08f7",
		"033a69dae8d8249831c9cb84fd9ec40fd72bcd3cbf1912d8a17f8306a3ed3982c7",
		"03243eb3a80aa41629ffc3b87ceef3759631c2f134ebc17262833ecfa5998f4359",
		"02125f7478ff9e573cdc50bf870aa5ab8e47c0c0e9744ac924c0dbae2b58462702"
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
		"03586a61df7b01c620cda8bd2a0a7f7b3089d17b76e942b498a51089cca38d63d5"
	],
	tx : function(tx){
//		if(!this.whitelist.includes(tx.from))
//			return {err: 1, message: "FROM field is not whitelist"};
		if(this.blacklist.includes(tx.from))
			if(tx.to !== "02abe27e83ce9b16a4783a2ad0db62328c9a725409aac5492474cf67a08e12c1f8")
				return {err: 1, message: "FROM field in blacklist"};

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