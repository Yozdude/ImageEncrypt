var base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=', // All charactes used in base64 encoding
	isUrl = false, // true if an image is selected via URL
	imageByteLimit = undefined, // The maximum number of encrypted bytes this image can hold
	alphaConvertLimit = 250, // All pixels of alpha value at least this much are converted
	lsbBitsUsed = 2; // The lower 2 bits of color data are used


// Sets up an image for use given a selection via the file select dialog
function readURL(input) {
	// Given an actual file has been selected
	if (input.files && input.files[0]) {
		// Clear the output
		$('#text').val('');
		isUrl = false;
		
		// Read the image data and display it
		var reader = new FileReader();
		reader.onload = function (e) {
			$('#img').attr('src',e.target.result);
			setTimeout(function() {
				// Calculate the allowable size of text that can be hidden
				imageByteLimit = Math.floor(($('#img').width() * $('#img').height()) * (3.0 / 4.0));
				$('#inputOutputPanel').fadeTo(500, 1);
				$('#inputOutput').val('');
				textAreaInput();
			}, 10);
		};
		reader.readAsDataURL(input.files[0]);
	}
}

// Sets up image selection via dragging
function handleFileSelect(e) {
	e.stopPropagation();
	e.preventDefault();

	if (e.dataTransfer.files && e.dataTransfer.files[0]) {
		// Clear the output
		$('#text').val('');
		isUrl = false;
		
		// Read the image data and display it
		var reader = new FileReader();
		reader.onload = function (e) {
			$('#img').attr('src', e.target.result);
			setTimeout(function() {
				// Calculate the allowable size of text that can be hidden
				imageByteLimit = Math.floor(($('#img').width() * $('#img').height()) * (3.0 / 4.0));
				$('#inputOutputPanel').fadeTo(500, 1);
				$('#inputOutput').val('');
				textAreaInput();
			}, 10);
		};
		reader.readAsDataURL(e.dataTransfer.files[0]);
	}
}

// Helper function for the image selection via dragging
function handleDragOver(e) {
	e.stopPropagation();
	e.preventDefault();
	e.dataTransfer.dropEffect = 'copy';
}

// Sets up some image selection methods
$(function() {
	// Setup the drop zone
	var dropZone = document.getElementById('imgDrop');
	dropZone.addEventListener('dragover', handleDragOver, false);
	dropZone.addEventListener('drop', handleFileSelect, false);

	// Sets up an image for use given a URL
	$('#urlInput').on('change keydown paste input', function() {
		$('#img').attr('src', document.getElementById('urlInput').value);
		setTimeout(function() {
			// Calculate the allowable size of text that can be hidden
			imageByteLimit = Math.floor(($('#img').width() * $('#img').height()) * (3.0 / 4.0));
			$('#inputOutputPanel').fadeTo(500, 1);
			$('#inputOutput').val('');
			textAreaInput();
		}, 10);
		isUrl = true;
	});

	$('#progressBarContainer').hide();
});

// Decode an image to find if there is a hidden message in it, and what that message is
var decode = function() {
	var img = new Image(),
		canvas = $('<canvas/>')[0], // Canvas to do the pixel manipulation in
		ctx = canvas.getContext('2d'), // Canvas context
		src = $('#img')[0].src; // Image data

	// Remove the http:// from the front of the URL and use a CORS proxy to get it.
	// This workaround is required because Cross Origin Resource Sharing will not
	// work for most servers.
	if (isUrl) {
		if (src.indexOf("https://") == 0) {
			src = src.substring(8);
		}
		if (src.indexOf("http://") == 0) {
			src = src.substring(7);
		}
		img.crossOrigin = "anonymous";
		src = 'http://www.corsproxy.com/' + src;
	}

	// Once the image is loaded we can decode it
	img.onload = function() {
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.drawImage(img, 0, 0);

		// Setup the progress bar. For larger messages and slower browsers this process might
		// take a while, so we'll try to keep the user informed.
		$('#progressBar').css('width', '0%');
		$('#progressBarContainer').show();

		// Create one 'level' for each level of least significant bits being used for the decoding.
		// These arrays will contain the binary data from those bits.
		var levels = [];
		for (var i = 0; i < lsbBitsUsed; i++) {
			levels[i] = '';
		}
		var data, str;
		var thisX = -1;
		var currentBit = 0;
		var lastCheckedBit = 0;
		var decryptedStart = '';
		var doneDecrypting = false;
		
		// Do one row at a time so that we can update the progress bar as we go along
		var fetchRow = function(x, callback) {
			return function() {
				// This actually goes over one column, so sue me
				for (var y = 0; y < canvas.height; y++) {
					// Get the data of each pixel
					data = ctx.getImageData(x, y, 1, 1);
					
					// If the alpha channel of the pixel is above the limit, convert it to the maximum and use it.
					// The reason for this is that the lower the alpha value, the more the RGB data is truncated.
					// For example, if the alpha value is 50, setting red to be 150 might result in it being 170.
					// This is done automatically to decrease the file size, and was rather annoying to find out.
					if (data.data[3] >= alphaConvertLimit) {
						// Get a binary string for each of the red, green, and blue bytes
						for (var z = 0; z < data.data.length - 1; z++) {
							str = data.data[z].toString(2);
							str = ('00000000' + str).slice(-8);
							
							// Store the binary information of the LSBs
							for (var i = 0; i < lsbBitsUsed; i++) {
								levels[i] = levels[i] + str[7 - i];
							}
						}

						// Since we only decode 3 bits at a time, every 8 bits check to see if the resulting
						// character is a valid base64 character. If it's not then the decoding is done as
						// we've gone past the message into gibberish.
						currentBit += 3;
						if (lastCheckedBit + 8 <= currentBit) {
							var checking = bin2String(levels[0].substring(lastCheckedBit, lastCheckedBit + 8));
							if (base64Chars.indexOf(checking) !== -1) {
								decryptedStart = decryptedStart + checking;
							} else {
								doneDecrypting = true;
							}
							lastCheckedBit += 8;
						}
					}
					
					// If we're done there is no reason to check the rest of the data
					if (doneDecrypting) {
						break;
					}

				}
				callback();
			}
		}

		// Updates the progress bar so the user doesn't think the program froze
		var updateProgressBar = function() {
			$('#progressBar').css('width', Math.ceil(100 * (thisX / canvas.width)) + '%');
		}

		// Update the progress bar every 100ms
		var updateProgressBarInterval = setInterval(updateProgressBar, 100);

		// Function that continually decodes a row, then pauses to that the progress bar can update if needed
		var checkFunc = function() {
			if (thisX < canvas.width && !doneDecrypting) {
				// If we're not done decrypting, keep going
				thisX++;
				setTimeout(fetchRow(thisX, checkFunc), 1);
			} else {
				// Decryption is complete, update the progress bar to reflect this
				updateProgressBar();

				// Stop updating the progress bar
				clearInterval(updateProgressBarInterval);
				$('#progressBarContainer').hide();

				// If the encryption covers the entire image data (The LSBs of all bytes in the image) it will not be decrypted yet.
				if (doneDecrypting) {
					decoded = decryptedStart;
				} else {
					// If the drcyption did not complete before reaching the end, attempt to decrypt it now
					
					// Combine the levels holding the binary data
					str = '';
					for (var i = 0; i < lsbBitsUsed; i++) {
						str = str + levels[i];
					}

					// Decode the binary data into a string
					decoded = bin2String(str);
					for (var i = decryptedStart.length; i < decoded.length; i++) {
						// The first non-base64 character marks the end of the valid data
						if (base64Chars.indexOf(decoded.charAt(i)) === -1) {
							decoded = decoded.substring(0, i);
							break;
						}
					}
				}

				// If the decoding was sucessful, display the message
				if (decoded) {
					var noError = false;
					while (!noError && decoded.length > 0) {
						try {
							decoded = decodeURIComponent(escape(atob(decoded)));
							noError = true;
						} catch (e) {
							decoded = decoded.substring(0, decoded.length - 1);
						}
					}
				} else {
					// The decoding failed because it could not find any base64 characters to decode
					decoded = 'This image has no encrypted message :(';
				}

				// Display the decoded text and animate
				$('#inputOutput').val(decoded);

				$('#img').addClass('decrypted').delay(250).queue(function (next) {
					$(this).removeClass('decrypted');
					next();
				});
				$('#inputOutput').addClass('decrypted').delay(250).queue(function (next) {
					$(this).removeClass('decrypted');
					next();
				});
				textAreaInput();
			}
		}

		checkFunc();
	}
	
	// Load the image source
	img.src = src;
}

// Converts a binary array to a string
function bin2String(array) {
  var result = "";
  for (var i = 0; i < array.length; i += 8) {
  	result = result + String.fromCharCode(parseInt(array.slice(i, i+8), 2));
  }
  return result;
}

// Converts a string to a binary array
function string2Bin(str) {
  var result = "";
  for (var i = 0; i < str.length; i++) {
    result = result + ('00000000' + str.charCodeAt(i).toString(2)).slice(-8);
  }
  return result;
}

// Encodes text into an image
function encode() {
	var binaryMsg = string2Bin(btoa(unescape(encodeURIComponent($('#inputOutput').val())))),
		img = new Image(),
		canvas = $('<canvas/>')[0],
		ctx = canvas.getContext('2d'),
		src = $('#img')[0].src;

	// Setup the progress bar to keep the user informed
	$('#progressBar').css('width', '0%');
	$('#progressBarContainer').show();

	// Get the image data if it is given via a URL using a CORS proxy.
	if (isUrl) {
		if (src.indexOf("https://") == 0) {
			src = src.substring(8);
		}
		if (src.indexOf("http://") == 0) {
			src = src.substring(7);
		}
		img.crossOrigin = "anonymous";
		src = 'http://www.corsproxy.com/' + src;
	}

	// Begin encoding once the image has loaded
	img.onload = function() {
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.drawImage(img, 0, 0);
		var encodeLevel = 1;
		var ctr = 0;
		var x = 0;
		var y = 0;
		var reachedEncryptLimit = false;

		// Encode 250 characters at a time so that there are pauses where the progress bar can update
		var encodePixels = function(callback) {
			return function() {
				for (var i = 0; i < 250; i++) {
					// Encode one row of LSBs at a time
					if (ctr < binaryMsg.length && encodeLevel <= lsbBitsUsed) {
						// Get the data for the current pixel if it is above the alpha limit
						data = ctx.getImageData(x, y, 1, 1);
						if (data.data[3] >= alphaConvertLimit) {
							// Replace the LSBs with our message data given by the curent encoding level
							data.data[0] = ((data.data[0] & (0xFF ^ (1 << (encodeLevel - 1)))) | (parseInt(binaryMsg[ctr]) << (encodeLevel - 1)));
							data.data[1] = ((data.data[1] & (0xFF ^ (1 << (encodeLevel - 1)))) | (parseInt(binaryMsg[ctr+1]) << (encodeLevel - 1)));
							data.data[2] = ((data.data[2] & (0xFF ^ (1 << (encodeLevel - 1)))) | (parseInt(binaryMsg[ctr+2]) << (encodeLevel - 1)));
							
							// Set the alpha to maximum so the RGB values don't change on us
							if (data.data[3] < 255) {
								data.data[3] = 255;
							}

							ctx.putImageData(data, x, y);
							ctr += 3;
						}

						// Keep going until all pixels have been used, then go to the next encoding level
						y++;
						if (y >= canvas.height) {
							x++;
							y = 0;
						}
						if (x >= canvas.width) {
							encodeLevel++;
							if (encodeLevel > lsbBitsUsed) {
								reachedEncryptLimit = true;
							}
							x = 0;
							y = 0;
						}
					} else {
						break;
					}
				}
				callback();
			}
		}

		// Function to update the progress bar
		var updateProgressBar = function() {
			$('#progressBar').css('width', Math.ceil(100 * (ctr / binaryMsg.length)) + '%');
		}

		// Update the progress bar every 100ms
		var updateProgressBarInterval = setInterval(updateProgressBar, 100);

		// Continuously runs and checks if the encryption is complete
		var checkFunc = function() {
			if (ctr < binaryMsg.length && !reachedEncryptLimit) {
				// Encryption is still going on, check again later
				setTimeout(encodePixels(checkFunc), 1);
			} else {
				// Encryption is complete
				updateProgressBar();

				clearInterval(updateProgressBarInterval);
				$('#progressBarContainer').hide();

				// Update the image with the image data from the canvas and show a short animation
				$('#img').attr('src', canvas.toDataURL());

				$('#img').addClass('encrypted').delay(250).queue(function (next) {
					$(this).removeClass('encrypted');
					next();
				});
				$('#inputOutput').addClass('encrypted').delay(250).queue(function (next) {
					$(this).removeClass('encrypted');
					next();
				});
			}
		}

		checkFunc();
	}
	
	// Load the image
	img.src = src;
}

// Keeps track of when the text goes over the allowable limit, and warns the user
function textAreaInput() {
	if (imageByteLimit) {
		var count = (string2Bin(btoa(unescape(encodeURIComponent($('#inputOutput').val())))).length / 8);
		$('#imgData').text(count + ' / ' + imageByteLimit);
		if (count >= imageByteLimit) {
			$('#imgData').addClass('errorText');
		} else {
			$('#imgData').removeClass('errorText');
		}
	}
}
