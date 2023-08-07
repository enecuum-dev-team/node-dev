#!/bin/bash

cd $W_DIR/test/autoTests/management
SESSION_ID=$(node launchTest.js --ts Claim_reward Transfer_coins Invalid_undelegate)
node checkSession.js --session $SESSION_ID

