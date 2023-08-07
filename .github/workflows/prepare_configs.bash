#!/bin/bash

cd $W_DIR
cp config.json.example config.json
cp snapshot.json.example snapshot.json
cp ./test/ecosystem.config.js ecosystem.config.js
cd test/autoTests; cp config.json.example config.json

