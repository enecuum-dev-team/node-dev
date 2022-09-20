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
} 

module.exports = {
    cTypes,
    cValidate : (params, paramsModel) => {
        let compareTypes = (param, paramModel) => {
            if (typeof param !== paramModel.type)
                throw new ContractError(`Incorrect parameter '${key}' type. Must be ${cTypes.hexStr64.type}.`)
        }

        for (let key in paramsModel) {
            let param = params[key]
            let paramModel = paramsModel[key]
            if (param === undefined)
                throw new ContractError(`Incorrect parameters structure. Param '${key}' is missing.`)

            if (paramModel.id === cTypes.hexStr64.id) {
                compareTypes(param, paramModel)
                if (!paramModel.regexp.test(param))
                    throw new ContractError(`Incorrect parameter '${key}' format. hexStr64`)
            }

            if (paramModel.id === cTypes.hexStr66.id) {
                compareTypes(param, paramModel)
                if (!paramModel.regexp.test(param))
                    throw new ContractError(`Incorrect parameter '${key}' format. hexStr66`)
            }

            if (paramModel.id === cTypes.bigInt.id) {
                compareTypes(param, paramModel)
            }

            if (paramModel.id === cTypes.array.id) {
                if (!paramModel.validate(param))
                    throw new ContractError(`Incorrect parameter '${key}' type. Must be array.`)
            }

            if (paramModel.id === cTypes.obj.id) {
                compareTypes(param, paramModel)
                if (!paramModel.validate(param))
                    throw new ContractError(`Incorrect parameter '${key}' type. Must be object.`)
            }
        }

        return true
    }
}