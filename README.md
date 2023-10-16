# eimis-bridge-poc
POC of a matrix bridge that should fullfil the EIMIS requirements

## Prerequisites

- Node, npm, docker, docker-compose installed
- Edit your /etc/hosts to add `127.0.0.1  bridge.local`

## Build

```bash
npm build
```

## Synapse server

[Start your Synapse instance with docker-compose](matrix/readme.md)

## Generate app service file

```bash
npm run generate -- -u http://bridge.local:9000
```

copy or link generated file to your Synapse config

```bash
cd matrix/mx-conf
cp ../../eimis-registration.yaml eimis-registration.yaml
```

### Edit synapse configuration

```bash
echo "\
app_service_config_files:\n\
  - /mx-conf/eimis-registration.yaml\
" >> synapse/mx-conf/homeserver.yaml
```
and restart synapse
```bash
cd synapse/mx-conf
docker-compose down && docker-compose up -d
```

## Start

```bash
npm run start
```

