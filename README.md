# Prerequisites 

After cloning the repository, make sure you have the following installed.

MySQL:
```
sudo apt install mysql-server -y
```

NodeJS:
```sh
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install -y nodejs
```

PM2:
```
sudo npm i -g pm2
```

Docker:

```
sudo apt install docker.io
```

Use [Docker official documentation](https://docs.docker.com/install/) for any issues.

# Install

1. In `package.json`, set URL for add-on binaries `enecuum-crypto` and `node-randomx` depending on OS (set `linux64` or `win64`).

2. Install the packages: 

   ```
   npm i
   ```

3. Start DB:

   ```
   docker run -d --name bit_db_leader -p 4000:3306 -e MYSQL_ROOT_PASSWORD=root enecuum/bit_db
   
   docker run -d --name bit_db_pow -p 4001:3306 -e MYSQL_ROOT_PASSWORD=root enecuum/bit_db
   
   docker run -d --name bit_db_pos -p 4002:3306 -e MYSQL_ROOT_PASSWORD=root enecuum/bit_db
   ```

# Run

## Prerequisites 

1. Create a copy of `config.json.example` and name it `config.json`. 

2. For Linux, in `config.json`, set the `dbhost` parameter to localhost: `"dbhost": "localhost"`. For Windows, find out the IP address of the virtual machine:

   ```
   docker-machine ip default
   ```
   
   and set this IP address in `config.json` with `"dbhost": "<ip address>"`.
   
3. For Linux, in `ecosystem.config.js`, change the following ports:

   - In Leader section, change explorer's port 80 to 1025:

     ```
     "args": "--explorer 1025 --dbport 4000"
     ```

   - In SpamBot section, change localhost port 80 to 1025:

     ```
     "args": "--host localhost:1025 --size 10 --keys test/keys.json"
     ```

## PoS-leader 

You can run PoS-leader using the following command:

```
pm2 start ecosystem.config.js --only "leader,leader_explorer,leader_cashier,leader_indexer,leader_miner,leader_stat,leader_transport"
```

## PoA 

1. Create PoA emulator:

   ```
   git clone --branch develop https://github.com/Enecuum/poa-check.git
   ```

2. Create `keys.json` file into the PoA directory:

   ```
   [
     {
       "prvkey": "9d3ce1f3ec99c26c2e64e06d775a52578b00982bf1748e2e2972f7373644ac5c",
       "pubkey": "029dd222eeddd5c3340e8d46ae0a22e2c8e301bfee4903bcf8c899766c8ceb3a7d"
     }
   ]
   ```

3. Run PoA with Genesis account:

   ```
   pm2 start ecosystem.config.js --only poa
   ```

## Spam_Bot

Spam_Bot generates and sends transactions.

1. Create `keys.json` file in `test` directory:

   ```
   [
     {
       "prvkey": "9d3ce1f3ec99c26c2e64e06d775a52578b00982bf1748e2e2972f7373644ac5c",
       "pubkey": "029dd222eeddd5c3340e8d46ae0a22e2c8e301bfee4903bcf8c899766c8ceb3a7d"
     },
     {
       "prvkey" : "b0d57e66e65c4059dc75d3a41b52e6ddac9a82722db836c6cf3e2a9b935a616a",
       "pubkey" : "034b4875bf08ffd5a4f0b06c21f951aa3e2f979d2d9f1bb4a64e0600eac2350beb"
     }
   ]
   ```

2. Run spam_bot:

   ```
   pm2 start ecosystem.config.js --only spam_bot
   ```
   
   You can change the number of transactions using key `--size N`.

## PoW and PoS

1. Create a PoS contract and delegate coins to it using [the following guide.](https://docs.google.com/document/d/1KSeLY7j12G5Kk44gBBwW4tcXbyAgNVVj4Wq67_BSvY8/edit)
   
2. Configure the following in `ecosystem.config.js` for PoW and PoS sections:

   - For `pos_miner` process, add PoS contract address created earlier with the `--pos_id` key.
   - For other processes, set the pubic key with `--id`.
   - Set the port that PoW/PoS will use with `--port`.
   - Set the leader's IP address and port to which PoW/PoS will connect with `--peer` using `0.0.0.0:0000` format.

3. Start the processes:

   - Start PoW:

   ```
   pm2 start ecosystem.config.js --only "pow_cashier,pow_miner,pow_transport"
   ```

   - Start PoS:

   ```
   pm2 start ecosystem.config.js --only "pos_cashier,pos_miner,pos_transport"
   ```


# Stop

To stop the process, use the following:
```
pm2 stop <process name | id>
pm2 delete <process name | id>
```
