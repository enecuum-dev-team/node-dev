
const { ContractError } = require("./errors")

const cTypes = {
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
    str : {
        id : 0x5, 
        type : "string"
    },
    strBigInt : {
        id : 0x6,
        type : "string",
        regexp : /^([0-9]{1,20}n{0,1}|\s*)$/i // {1,20} just like in sql/db.sql
    },

    enqHash64 : {
        id : 0x7, 
        type : "string", 
        regexp : /^[0-9a-fA-F]{64}$/i
    },
    enqHash66 : {
        id : 0x8,
        type : "string", 
        regexp : /^[0-9a-fA-F]{66}$/i
    },

    hexStr1_150 : {
        id : 0x9, 
        type : "string",
        regexp : /^((0x[0-9a-fA-F]{1,148})|[0-9a-fA-F]{1,150})$/i
    },
    hexStr1_66 : {
        id : 0x0, 
        type : "string",
        regexp : /^((0x[0-9a-fA-F]{1,64})|[0-9a-fA-F]{1,66})$/i
    },
    hexStr1_64 : {
        id : 0xA, 
        type : "string",
        regexp : /^((0x[0-9a-fA-F]{1,62})|[0-9a-fA-F]{1,64})$/i
    },

    int : {
        id : 0xB,
        type : "number",
        validate : num => Number.isSafeInteger(num)
    },
    byte : {
        id : 0xC,
        type : "number",
        validate : num => num >= 0 && num < 256
    },
    str40 : {
        id : 0xD,
        type : "string",
        validate : str => str.length < 41
    }
}

module.exports = {
    cTypes,
    cValidate : (params, paramsModel) => {
        let compareTypes = (param, paramModel, key) => {
            if (typeof param !== paramModel.type)
                throw new ContractError(`Incorrect parameter '${key}' type.`)
        }

        let checkWithValidation = (param, paramModel, key, type) => {
            if (paramModel.id === cTypes[type].id) {
                compareTypes(param, paramModel, key)
                if (!paramModel.validate(param))
                    throw new ContractError(`Incorrect parameter '${key}' type. Must be ${type}.`)
            }
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

            checkRegex("enqHash64")
            checkRegex("enqHash66")
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

            checkWithValidation(param, paramModel, key, "obj")
            checkWithValidation(param, paramModel, key, "int")
            checkWithValidation(param, paramModel, key, "byte")
            checkWithValidation(param, paramModel, key, "str40")

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
