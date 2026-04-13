#!/usr/bin/env sh

INPUT_DIR="$1"
OUTPUT_FILE="$2"

##
## CHECK INPUTS
##
if [ -z "$INPUT_DIR" ]; then
    echo "ERROR: input directory not defined (arg 1)"
    exit 1
fi

if [ -z "$OUTPUT_FILE" ]; then
    echo "ERROR: output file not defined (arg 2)"
    exit 1
fi

if [ ! -d "$INPUT_DIR" ]; then
    echo "ERROR: input directory $INPUT_DIR not found"
    exit 2
fi

# Get all PNG files, sorted
PNG_FILES=$(find "$INPUT_DIR" -maxdepth 1 -name "*.png" -type f | sort)

if [ -z "$PNG_FILES" ]; then
    echo "ERROR: no PNG files found in $INPUT_DIR"
    exit 2
fi

echo "==> Combining PNG files from $INPUT_DIR into $OUTPUT_FILE..."

# Count files
FILE_COUNT=$(echo "$PNG_FILES" | wc -l)
echo "    Found $FILE_COUNT PNG files"

# Create temporary directory for pages
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Process files in batches of 6 (2x3 grid)
PAGE_NUM=1
BATCH=""
BATCH_COUNT=0

for FILE in $PNG_FILES; do
    BATCH="$BATCH $FILE"
    BATCH_COUNT=$((BATCH_COUNT + 1))

    if [ $BATCH_COUNT -eq 6 ]; then
        # Create page with 2x3 grid
        PAGE_PNG="$TEMP_DIR/page_$(printf "%03d" $PAGE_NUM).png"
        magick montage $BATCH -tile 2x3 -geometry 1323x1149+0+0 -background white "$PAGE_PNG"
        echo "    Created page $PAGE_NUM with $BATCH_COUNT images"

        # Reset for next batch
        BATCH=""
        BATCH_COUNT=0
        PAGE_NUM=$((PAGE_NUM + 1))
    fi
done

# Handle remaining files (less than 6)
if [ $BATCH_COUNT -gt 0 ]; then
    PAGE_PNG="$TEMP_DIR/page_$(printf "%03d" $PAGE_NUM).png"
    magick montage $BATCH -tile 2x3 -geometry 1323x1149+0+0 -background white "$PAGE_PNG"
    echo "    Created page $PAGE_NUM with $BATCH_COUNT images"
fi

# Convert PNGs to PDFs
mogrify -format pdf -density 300 -units PixelsPerInch "$TEMP_DIR/*.png"
echo "    Created PDFs from PNGs"

# Merge PDFs into the single Output PDF
gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -dPDFSETTINGS=/prepress -sOutputFile="$OUTPUT_FILE" $(ls "$TEMP_DIR"/*.pdf)
echo "    Output: $OUTPUT_FILE"
