#!/bin/bash

docker run -it --rm \
    -v "./mx-data:/data" \
    -v "./mx-conf:/mx-conf" \
    -e SYNAPSE_SERVER_NAME=matrix.local \
    -e SYNAPSE_CONFIG_PATH=/mx-conf/homeserver.yaml \
    -e SYNAPSE_REPORT_STATS=yes \
    matrixdotorg/synapse:v1.83.0 generate

chown -R 991:991 mx-data/
