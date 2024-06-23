import requests
from urllib.parse import unquote, quote_plus
UID = "76847724"
BOOK = "2517582"

T_VAL = {
  "codex": {
    "title": {
      "titleId": BOOK,
      "slug": BOOK,
      "cover": {
        "imageURL": "TODO", # This needs done later
        "color": "#F3F3F3"
      }
    },
    "loan": {
      "psnKey": f"{UID}-{BOOK}",
      "slug": f"{UID}-{BOOK}"
    },
    # This changes per library
    "library": {
      "key": "clc-columbus",
      "name": "Digital Downloads Collaboration",
      "logoURL": "https://thunder.cdn.overdrive.com/logo-resized/633?1499097652",
      "colors": [
        "#5d4c46",
        "#44b3c2"
      ]
    }
  },
  "dewey-url": "https://libbyapp.com",
  "spec": "V22"
}


r = requests.get(f"https://thunder.api.overdrive.com/v2/libraries/clc-columbus/media/{BOOK}?x-client-id=bifocal").json()

# RVid = r.get("reserveId")
# print(RVid)

