// const zlib = require("zlib")

let schema = {
    "root" :            "0000",
    "custom" :          "0100",
    "create_token" :    "0200",
    "delegate" :        "0300",
    "undelegate" :      "0400",
    "signature" :       "0500",
    "hash" :            "0600",
    "string" :          "0700",
    "int" :             "0800",
    "bigint" :          "0900",
    "float" :           "0a00",
    "object" :          "0c00",
    "key" :             "0d00",
    "procedure_name" :  "0e00",
    "parameters" :      "0f00",
    "create_pos" :      "1000",
    "pos_reward" :      "1100",
    "transfer" :        "1200",
    "mint" :            "1300",
    "burn" :            "1400",
    "pool_create" :     "1500",
    "pool_add_liquidity" :      "1600",
    "pool_remove_liquidity" :   "1700",
    "pool_sell_exact" :         "1800",
    "farm_create" :             "1900",
    "farm_get_reward" :         "1a00",
    "farm_increase_stake" :     "1b00",
    "farm_close_stake" :        "1c00",
    "farm_decrease_stake" :     "1d00",
    "farm_add_emission" :       "1e00",
    "dex_cmd_distribute" :      "1f00",
    "pool_sell_exact_routed" :  "2000",
    "pool_buy_exact" :          "2100",
    "pool_buy_exact_routed" :   "2200",
    "token_send_over_bridge" :  "2300",
    "claim_init" :              "2400",
    "claim_confirm" :           "2500",
    "claim" :                   "2600",
};

class ContractParser {
    constructor(config) {
        this.schema = schema;
        this.contract_pricelist = config.contract_pricelist;
    }
    get pricelist(){
        return this.contract_pricelist;
    }
    toHex(d) {
        let hex = Number(d).toString(16);
        while ((hex.length % 2) !== 0) {
            hex = "0" + hex;
        }
        return hex;
    }
    sizeMarker(size) {
        let markerSize = 0xFFFF; // Max chunk size
        if(size > markerSize)
            throw new Error(`Size can't be bigger than ${markerSize}`);
        let marker = this.toHex(size);
        while (marker.length < 4) {
            marker = "0" + marker;
        }
        return marker;
    }
    getChunk(bin){
        // let size = parseInt(bin.substring(0, 4), 16);
        let size = parseInt(bin.slice(0, 2).toString("hex"), 16);
        let key = this.getkey(this.schema, bin.slice(2, 4).toString("hex"));
        return {
            size : size,
            key : key,
            data : bin.slice(4, size)
        }
    }
    // TODO: possible false-positive results because of data field format
    isContract(raw) {
        // raw = zlib.brotliDecompressSync(Buffer.from(raw));
        if(raw === undefined || raw === null)
            return false;
        let chunk = this.getChunk(raw);
        if((chunk.size === raw.length) && this.contract_pricelist.hasOwnProperty(chunk.key))
            return chunk.key;
        return false;
    }
    getkey(object, value) {
        return Object.keys(object).find(key => object[key] === value);
    }

    dataFromNestedObj(obj){
        let res = []
        for(let param in obj){
            let type = undefined;
            switch (typeof obj[param]){
                case "bigint" : {
                    type = "bigint";
                    break;
                }
                case "string" : {
                    let value = obj[param]
                    if (/^(?=[0-9a-fA-F]*$)(?:.{64}|.{66})$/.test(value)) {
                        type = "hash";
                        break;
                    } else {
                        type = "string";
                        break;
                    }
                }
                case "object" : {
                    type = "object";
                    obj[param] = this.dataFromNestedObj(obj[param])
                    break;
                }
                default : type = "int";
            }
            //let type = (typeof obj[param] === "string") ? "string" : "int";
            res.push({key : param, [type] : obj[param]})
        }
        return res
    }
    dataFromObject(obj){
        let res = {
            parameters : []
        };
        res.parameters = this.dataFromNestedObj(obj.parameters)
        let serialized = this.serialize_object({
            [obj.type] : res
        });
        // return zlib.brotliCompressSync(serialized)
        return serialized
    }
    serialize_object(obj, objKey){
        let binary = Buffer.alloc(0);
        if((!(Array.isArray(obj))) && (typeof obj !== "object")) {
            if (objKey === "hash")
                return Buffer.from(obj, "hex");
            return Buffer.from(obj.toString());
        }
        if(Array.isArray(obj)){
            for (let el of obj){
                let res = this.serialize_object(el);
                binary = Buffer.concat([binary, res]);
            }
        }
        else {
            for (let key in obj) {
                let code = this.schema[key];
                let res = this.serialize_object(obj[key], key);
                binary = Buffer.concat([binary, Buffer.from(this.sizeMarker(res.length + 4), "hex"), Buffer.from(code, "hex"), res]);
            }
        }
        return binary;
    }
    fromBuffer(key, data){
        return data.toString(key === "hash" ? "hex" : undefined)
    }
    deserialize(bin){
        let arr = [];
        while(bin.length > 0){
            let chunk = this.getChunk(bin);
            if(bin.length === chunk.size){
                if((!this.contract_pricelist.hasOwnProperty(chunk.key))
                    && (chunk.key !== "parameters")
                    && (chunk.key !== "object")){
                    arr.push([chunk.key, this.fromBuffer(chunk.key, chunk.data)]);
                    return arr;
                }
                bin = bin.slice(4, bin.length);
            }
            if (chunk.key === "object") {
                arr.push([chunk.key, this.deserialize(chunk.data)])
            } else if (bin.length > chunk.size) {
                arr.push([chunk.key, this.fromBuffer(chunk.key, chunk.data)]);
            } else
                arr.push([chunk.key, this.deserialize(chunk.data)]);
            bin = bin.slice(chunk.size);
        }
        return arr;
    }
    prettify(data){
        let res = {};
        let arr = [];
        for(let i = 0; i < (data.length); i++){
            let el = data[i];
            if(Array.isArray(el)){
                arr.push(this.prettify(el))
            }
            else{
                if(!Array.isArray(data[i+1])){
                    res[el] = data[i+1];
                    i++;
                }
                else{
                    res[el] = this.prettify(data[i+1]);
                    i++;
                }
            }
        }
        if(arr.length > 0)
            return arr;
        return res;
    }
    parseNestedObj(obj){
        let res = {}
        for(let i = 0; i < obj.length; i+=2) {
            let value = (Object.keys(obj[i+1]))[0];
            let insideVal = obj[i+1][value];
            if(value === "int" || value === "bigint" || value === "float") {
                if(value === "bigint") {
                    value = BigInt(insideVal);
                }
                else {
                    if(isNaN(insideVal))
                        throw new Error("Not a number");
                    value = parseInt(insideVal);
                }
            }
            else if (value === "object") {
                value = this.parseNestedObj(insideVal);
            } else
                value = insideVal;
            res[obj[i].key] = value;
        }
        return res;
    }
    parse(raw){
        // raw = zlib.brotliDecompressSync(Buffer.from(raw));
        let data = {};
        let input = (this.deserialize(raw))[0];
        data.type = input[0];
        input = this.prettify(input[1]);
        //data.procedure_name = input[0].procedure_name;
        let params = input[0].parameters;
        data.parameters = {};
        data.parameters = this.parseNestedObj(params);
        console.log(data)
        return data;
    }
}
module.exports.ContractParser = ContractParser;