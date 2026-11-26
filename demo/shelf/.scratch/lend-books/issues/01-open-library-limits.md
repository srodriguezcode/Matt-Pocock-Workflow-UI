# 01 — Open Library API limits

Type: research
Status: resolved

A loan card shows the cover and the title of the book. How many requests can the app send to Open Library?

## Answer

The limit is 100 requests in 5 minutes from one IP address. One loan card needs one request. The app keeps each cover after the first request, so the app stays far below the limit.
