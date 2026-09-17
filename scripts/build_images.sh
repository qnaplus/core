#!/bin/sh
docker build --rm -t battlesquid0101/qnaplus_bot -f ./services/bot/Dockerfile .
docker build --rm -t battlesquid0101/qnaplus_updater -f ./services/updater/Dockerfile .
