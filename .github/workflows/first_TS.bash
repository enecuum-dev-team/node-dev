#!/bin/bash

cd $W_DIR/test/autoTests/management
SESSION_ID=$(node launchTest.js --ts Send_valid_native_transaction Send_invalid_native_transaction Create_invalid_pos_contract Send_valid_custom_token_transaction)
node checkSession.js --session $SESSION_ID

