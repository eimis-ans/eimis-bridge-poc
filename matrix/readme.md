# Synapse instance

### Matrix configuration

- Linux :

  Run this script to generate a signing key

    ```bash
    chmod +x init.sh
    sudo ./init.sh
    ```
  You'll need to be able to write in mx-conf directory

    ```bash
    sudo chmod a+w -R ./mx-conf/
    ```

## start

```bash
docker-compose up -d
```

and wait a bit until synapse container is healthy

### Create new matrix user
- Linux
  ```bash
  docker exec -it matrix_synapse_1 register_new_matrix_user -u eimis_firstUser -a -c /mx-conf/homeserver.yaml
  ```
## Log in
You can check that synapse server is running at http://matrix.local:8008/_matrix/static/
You can login to element at http://localhost:8083
