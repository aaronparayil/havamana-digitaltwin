# Climate Data

The local `grd/` directory contains source climate grids for 2010–2025:

- Yearly maximum temperature, 1.0 x 1.0 grid
- Yearly minimum temperature, 1.0 x 1.0 grid
- Yearly rainfall, 0.25 x 0.25 grid

There are 48 raw binary GRD files, approximately 452 MB in total. They are intentionally ignored by Git and should not be committed to the frontend repository. The backend data pipeline should read them locally, extract the Karnataka/Bengaluru pilot-region subset, and publish normalized observations through the Flask API.

Record the authoritative source, license, binary layout, byte order, dimensions, no-data value, and extraction date before using the files in experiments or reports.