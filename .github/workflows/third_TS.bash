#!/bin/bash

cd $W_DIR/test/autoTests/management
SESSION_ID=$(node launchTest.js --ts Burn_coins Create_mineable_token Create_invalid_token)
node checkSession.js --session $SESSION_ID

