# LibbyRip

Rip all your favorite audiobooks from libby!

![Exporting audiobook](imgs/export.png)
![Showing chapters](imgs/chapters.png)

<sup>Be careful, I have had a library card banned in the past from using this tool </sup>

## How to use

1. Install the [TamperMonkey](https://www.tampermonkey.net/) extension for your browser.
2. Install the userscript from the [GreasyFork page](https://greasyfork.org/en/scripts/498782-libregrab)
3. Find your audiobook on Libby and export.


## Using the Python script

The Python script provided with this repo provides an optional way to bake metadata in your downloaded media.

To run the script Python is required, and you must install the dependencies using the following command:
```bash
pip install -r requirements.txt
```
Then simply run the script, and drag-and-drop the extracted folder with your audiobook in it. (You must extract the zip file, then use the folder with mp3s in it)
If you wish to use the script to make metadata, you must `Export audiobook` to include the metadata in the zip file.
