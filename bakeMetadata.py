#!/usr/bin/env python3
import eyed3, os, json
from eyed3.id3 import Tag
from eyed3.id3.frames import ChapterFrame
import mimetypes

workingDir = input("Path to audiobook dir: ").strip()
if workingDir.startswith("'"):
    workingDir = workingDir[1:-1]
workingList = os.listdir(workingDir)


if not "metadata" in workingList:
    print("ERROR: Working directory MUST contain a metadata directory. Remember to click the 'Export audiobook' button in the website!")
    exit(1)
cover = [f for f in os.listdir(os.path.join(workingDir, "metadata")) if f.startswith("cover")]
if len(cover) != 1:
    print("ERROR: Cover art not found")
    exit(1)

f = open(os.path.join(workingDir, "metadata", cover[0]), "rb")
coverMime = mimetypes.guess_type(cover[0])[0]
coverBytes = f.read()
f.close()

metadata = json.load(open(os.path.join(workingDir, "metadata", "metadata.json"), "r"))

authorName = "Unknown"
for creator in metadata["creator"]:
    if creator["role"] == "author":
        authorName = creator["name"]

chapters = {}
for chap in metadata["chapters"]:
    chapters[chap["spine"]] = chapters.get(chap["spine"], [])
    chapters[chap["spine"]].append(chap)

for file in workingList:
    if not file.startswith("Part "): continue
    number = file[len("Part "):].split(".")[0]
    
    audiofile = eyed3.load(os.path.join(workingDir, file))
    if audiofile.tag is None:
        audiofile.initTag()
    else:
        audiofile.tag.clear()
    audiofile.tag.title = "Part " + str(int(number))
    audiofile.tag.artist = authorName
    audiofile.tag.images.set(3, coverBytes, coverMime)
    audiofile.tag.album = metadata["title"]
    audiofile.tag.track_num = (number, len(metadata["spine"]))

    
    last = None

    child_ids = []
    for i, chap in enumerate(chapters.get(int(number) - 1, [])):
        if (last is None):
            last = chap
            continue
        name = ("ch" + str(i)).encode("ascii")
        child_ids.append(name)
        c = audiofile.tag.chapters.set(name, (int(last["offset"])*1000, int(chap["offset"])*1000 - 1))
        c.title = last["title"]
        last = chap
    if last is not None:
        c = audiofile.tag.chapters.set(b"last", (int(last["offset"])*1000, int(metadata["spine"][chap["spine"]]["duration"]*1000) ))
        c.title = last["title"]

    toc = audiofile.tag.table_of_contents.set(b"toc", toplevel=True,
                                child_ids=child_ids + [b"last"],
                                description=u"Table of Contents")
    audiofile.tag.save()

    
