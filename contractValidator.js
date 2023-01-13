
const { ContractError } = require("./errors")

const cTypes = {
    hexStr64 : {
        id : 0x0, 
        type : "string", 
        regexp : /^[0-9a-fA-F]{64}$/i
    },
    bigInt : {
        id : 0x1,
        type : "bigint"
    },
    array : {
        id : 0x2,
        validate : Array.isArray
    },
    obj : {
        id : 0x3,
        type: "object",
        validate : obj => !Array.isArray(obj)
    },
    number : {
        id : 0x4,
        type : "number"
    },
    hexStr66 : {
        id : 0x5, 
        type : "string", 
        regexp : /^[0-9a-fA-F]{66}$/i
    },
    hexStr1_150 : {
        id : 0x6, 
        type : "string",
        regexp : /^[0-9a-fA-F]{1,150}$/i
    },
    str : {
        id : 0x7, 
        type : "string"
    },
    hexStr1_66 : {
        id : 0x8, 
        type : "string",
        regexp : /^[0-9a-fA-F]{1,66}$/i
    },
    hexStr1_64 : {
        id : 0xA, 
        type : "string",
        regexp : /^[0-9a-fA-F]{1,64}$/i
    },
    strBigInt : {
        id : 0x9,
        type : "string",
        regexp : /^([0-9]+n{0,1}|\s*)$/i
    }
}

module.exports = {
    cTypes,
    cValidate : (params, paramsModel) => {
        let compareTypes = (param, paramModel, key) => {
            if (typeof param !== paramModel.type)
                throw new ContractError(`Incorrect parameter '${key}' type.`)
        }

        for (let key in paramsModel) {
            let param = params[key]
            let paramModel = paramsModel[key]

            let checkRegex = function (type) {
                if (paramModel.id === cTypes[type].id) {
                    compareTypes(param, paramModel, key)
                    if (!paramModel.regexp.test(param))
                        throw new ContractError(`Incorrect parameter '${key}' format. ${type}`)
                }
            }

            if (param === undefined)
                throw new ContractError(`Incorrect parameters structure. Param '${key}' is missing.`)

            checkRegex("hexStr64")
            checkRegex("hexStr66")
            checkRegex("hexStr1_66")
            checkRegex("hexStr1_64")
            checkRegex("hexStr1_150")

            if (paramModel.id === cTypes.bigInt.id) {
                compareTypes(param, paramModel, key)
            }

            if (paramModel.id === cTypes.array.id) {
                if (!paramModel.validate(param))
                    throw new ContractError(`Incorrect parameter '${key}' type. Must be array.`)
            }

            if (paramModel.id === cTypes.obj.id) {
                compareTypes(param, paramModel, key)
                if (!paramModel.validate(param))
                    throw new ContractError(`Incorrect parameter '${key}' type. Must be object.`)
            }

            if (paramModel.id === cTypes.str.id) {
                compareTypes(param, paramModel, key)
            }

            if (paramModel.id === cTypes.strBigInt.id) {
                compareTypes(param, paramModel, key)
                if (!paramModel.regexp.test(param))
                    throw new ContractError(`Incorrect parameter '${key}' format. strBigInt`)
            }
        }

        return true
    }
}
