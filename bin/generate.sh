#! /usr/bin/env sh

#
# GENERATE INVITE
# Generate a specifc invitation png
#

INVITE_CODE="$1"
INVITE_NAME="$2"
DOMAIN="$3"
OUTPUT_DIR="$4"
INVITE_TEMPLATE_HEADER="${5:-./share/invite_template_header.png}"
INVITE_TEMPLATE_FOOTER="${6:-./share/invite_template_footer.png}"
INVITE_TEMPLATE_BASE="${7:-./share/invite_template.png}"

##
## CHECK INPUTS
## Make sure all input arguments are provided
## Make sure template files exist
##
if [ -z "$INVITE_CODE" ]; then
	echo "ERROR: invite code not defined (arg 1)"
	exit 1
fi
if [ -z "$INVITE_NAME" ]; then
	echo "ERROR: invite name not defined (arg 2)"
	exit 1
fi
if [ -z "$DOMAIN" ]; then
	echo "ERROR: domain not defined (arg 3)"
	exit 1
fi
if [ -z "$OUTPUT_DIR" ]; then
	echo "ERROR: output directory not defined (arg 4)"
	exit 1
fi
if [ -z "$INVITE_TEMPLATE_HEADER" ]; then
	echo "ERROR: invite template header not defined (arg 5)"
	exit 1
fi
if [ ! -f "$INVITE_TEMPLATE_HEADER" ]; then
	echo "ERROR: invite template header $INVITE_TEMPLATE_HEADER not found"
	exit 2
fi
if [ -z "$INVITE_TEMPLATE_FOOTER" ]; then
	echo "ERROR: invite template footer not defined (arg 6)"
	exit 1
fi
if [ ! -f "$INVITE_TEMPLATE_FOOTER" ]; then
	echo "ERROR: invite template footer $INVITE_TEMPLATE_FOOTER not found"
	exit 2
fi
if [ -z "$INVITE_TEMPLATE_BASE" ]; then
	echo "ERROR: invite template base not defined (arg 7)"
	exit 1
fi
if [ ! -f "$INVITE_TEMPLATE_BASE" ]; then
	echo "ERROR: invite template base $INVITE_TEMPLATE_BASE not found"
	exit 2
fi



echo "==> Generating invitation for $INVITE_CODE ($INVITE_NAME)..."
echo "    base template: $INVITE_TEMPLATE_BASE"
echo "    header template: $INVITE_TEMPLATE_HEADER"
echo "    footer template: $INVITE_TEMPLATE_FOOTER"
echo "    output directory: $OUTPUT_DIR"



# Create base output directory
mkdir -p "$OUTPUT_DIR"
if [ ! -d "$OUTPUT_DIR" ]; then
	echo "ERROR: could not create output directory $OUTPUT_DIR"
	exit 2
fi

# Create invites directory
INVITES_DIR="$OUTPUT_DIR/invites"
mkdir -p "$INVITES_DIR"
if [ ! -d "$INVITES_DIR" ]; then
	echo "ERROR: could not create invites directory $INVITES_DIR"
	exit 2
fi

# Create qrcodes directory
QRCODES_DIR="$OUTPUT_DIR/qrcodes"
mkdir -p "$QRCODES_DIR"
if [ ! -d "$QRCODES_DIR" ]; then
	echo "ERROR: could not create qrcodes directory $QRCODES_DIR"
	exit 2
fi

# Set URLs
RSVP_URL="$DOMAIN/rsvp"
RSVP_INVITE_URL="$RSVP_URL?invite=$INVITE_CODE"

# Create QR Code
QRCODE_FILE="$QRCODES_DIR/$INVITE_CODE.png"
qrencode -s 8 -m 2 -t png -o "$QRCODE_FILE" "$RSVP_INVITE_URL"

# Set output
output="$INVITES_DIR/$INVITE_CODE.png"
echo "    output: $output"

# Add header template to base template
magick \( -page 1323x1149+0+0 "$INVITE_TEMPLATE_BASE" \) \
	\( -page +32+28 "$INVITE_TEMPLATE_HEADER" \) \
	-flatten "$output"

# Add Invite Name
magick "$output" -gravity Center -fill black -font Noto-Serif-Bold -pointsize 64 \
	-annotate +0-150 "$INVITE_NAME" "$output"

# Add RSVP link
magick "$output" -fill black -font Inconsolata-Black -pointsize 48 \
	-annotate +125+580 "$DOMAIN/rsvp" "$output"

# Add Invite Code
magick "$output" \( -background '#eee' -fill black -font Inconsolata-Black -pointsize 54 \
	-size 825x caption:" $INVITE_CODE " -trim -bordercolor '#eee' -border 10 +repage \) \
	-geometry +110+710 -composite "$output"

# Add footer template to base template
magick \( -page 1323x1149+0+0 "$output" \) \
	\( -page +36+968 "$INVITE_TEMPLATE_FOOTER" \) \
	-flatten "$output"

# Add QR Code
magick \( -page 1323x1149+0+0 "$output" \) \
	\( -page +965+650 "$QRCODE_FILE" \) \
	-flatten "$output"