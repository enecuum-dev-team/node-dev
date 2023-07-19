#!/bin/bash

cd $W_DIR
git submodule init
GIT_SSH_COMMAND=\'ssh -i ~/.ssh/f3_test_rsa\' git submodule update test
GIT_SSH_COMMAND=\'ssh -i ~/.ssh/f3_ext\' git submodule update ext

