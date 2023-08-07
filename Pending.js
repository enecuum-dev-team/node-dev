/**
 * Node Trinity source code
 * See LICENCE file at the top of the source tree
 *
 * ******************************************
 *
 * Pending.js
 * TX validation
 *
 * ******************************************
 *
 * Authors: K. Zhidanov, A. Prudanov, M. Vasil'ev
 */

const crypto = require('crypto');
const Utils = require('./Utils');
const ContractMachine = require('./SmartContracts');
class Pending {
	constructor(db){
		this.db = db;
		this.CFactory = new ContractMachine.ContractFactory(this.db.app_config);
	}

	async get_txs(count, timeout_s, enable_random){
		let txs = await this.db.pending_peek(count, timeout_s);
		if (enable_random) {
			return [];
		} else {
			return txs;
		}
	}

	get_random_txs(count){
		let txs = [];
		console.warn("Random TXs has been disabled.");
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
		if(this.CFactory.isContract(tx.data)){
			if(!this.CFactory.validate(tx.data)){
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
	digit_regexp : /(^0$)|(^[1-9]\d*$)/,
	hex_regexp : /^[A-Fa-f0-9]+$/,
	name_regexp : /^[0-9a-zA-Z\/\+= _\-/.]{0,512}$/,
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
	tx : function(tx){
//		if(!this.whitelist.includes(tx.from))
//			return {err: 1, message: "FROM field is not whitelist"};
		if(this.blacklist.includes(tx.from))
			if(tx.to !== "02abe27e83ce9b16a4783a2ad0db62328c9a725409aac5492474cf67a08e12c1f8") //KuCoin
				return {err: 1, message: "FROM field in blacklist"};
		if(this.locklist.includes(tx.from))
			if(tx.to !== "02833f453fb8bf10cc5e8fd362d563851543559f3ea6e662ef114d8db8f72dda19" && tx.to !== "03165142a92f3ff0d18567b78cc33a208145c32d1f71f51750a657dbc580118ecd") //Genesis
				return {err: 1, message: "FROM field in locklist"};

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
			if(typeof tx.amount === 'string' && tx.amount.charAt(0) === "0")
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