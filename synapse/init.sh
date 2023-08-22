#!/bin/bash

source .env

docker run -it --rm \
    -v "matrix_matrix-data:/data" \
    -v "./mx-conf:/mx-conf" \
    -e SYNAPSE_SERVER_NAME=matrix.local \
    -e SYNAPSE_CONFIG_PATH=/mx-conf/homeserver.yaml \
    -e SYNAPSE_REPORT_STATS=yes \
    matrixdotorg/synapse:v1.83.0 generate