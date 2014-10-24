ImageEncrypt
============

Code for the www.imageencrypt.com website, which allows you to hide text within images and decode said text all within your browser! Tested on Chrome, Firefox, and Safari, and while Chrome is the fastest (by a fair margin), it should work on the other two just fine, and *should* work on most other major browsers (maybe not IE, but no loss there).


Lessons Learned
============
- RGB values in each pixel in a png are truncated according to the alpha value of said pixel. For example, a pixel with alpha value 50 and red value of 120 might actually end up with a red value of 170 once set and saved.
- base64 is an excellent way of encoding utf-8 values as binary data.
- There is a very large difference between the Firefox and Chrome javascript interperters, to the point where this code runs ~10 times as fast on Chrome as it does on Firefox.
