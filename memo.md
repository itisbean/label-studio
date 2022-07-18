# Remark

## Run with Docker

- clone repo

```bash
git clone https://github.com/itisbean/label-studio.git
cd label-studio
```

- build a local image

```bash
docker build -t heartexlabs/label-studio:latest .
```

- run with docker compose

```bash
docker-compose up -d
```

## Run directly

```bash
git clone https://github.com/itisbean/label-studio.git
cd label-studio
# Install all package dependencies
pip3 install -e .
# Run database migrations
# python3 label_studio/manage.py migrate
# Start the server in development mode at http://localhost:8080
python3 label_studio/manage.py runserver
```

## Usage

- create a project.

- label setting:

```xml
<View>
  <Text name="text" value="$text" granularity="word"/>
  <Labels name="label" toName="text" value="$labels" choice="multiple"/>
</View>
```
