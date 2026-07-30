/* Origen para postMessage al cotizador padre: mismo origin salvo file:// */
const CC_TARGET_ORIGIN = (location.origin && location.origin !== 'null') ? location.origin : '*';

/* ── DATA NUEVO ── */
const DATA_NUEVO = [{"equipo":"MacBook Neo Sin Touch ID","gl_plan":"Ceven NeoCare","cc_plan":"Ceven NeoCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLNeoCa","precio":61.84},{"canal":"GL","años":3,"sku":"3AGLNeoCa","precio":71.74},{"canal":"GL","años":4,"sku":"4AGLNeoCa","precio":81.64},{"canal":"GL","años":5,"sku":"5AGLNeoCa","precio":93.52},{"canal":"CC","años":2,"sku":"2ACCNeoCa","precio":124.6},{"canal":"CC","años":3,"sku":"3ACCNeoCa","precio":152.32},{"canal":"CC","años":4,"sku":"4ACCNeoCa","precio":191.92},{"canal":"CC","años":5,"sku":"5ACCNeoCa","precio":247.36}],"precio_rep":354.55},{"equipo":"MacBook Neo Touch ID","gl_plan":"Ceven NeoCare","cc_plan":"Ceven NeoCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLNeoCa","precio":61.84},{"canal":"GL","años":3,"sku":"3AGLNeoCa","precio":71.74},{"canal":"GL","años":4,"sku":"4AGLNeoCa","precio":81.64},{"canal":"GL","años":5,"sku":"5AGLNeoCa","precio":93.52},{"canal":"CC","años":2,"sku":"2ACCNeoCa","precio":124.6},{"canal":"CC","años":3,"sku":"3ACCNeoCa","precio":152.32},{"canal":"CC","años":4,"sku":"4ACCNeoCa","precio":191.92},{"canal":"CC","años":5,"sku":"5ACCNeoCa","precio":247.36}],"precio_rep":356.36},{"equipo":"MacBook Air (Retina, 13\", 2020)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":531.62},{"equipo":"MacBook Air (M1, 2020)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":582.15},{"equipo":"Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":644.51},{"equipo":"Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos Ethernet 10 Gb","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":644.51},{"equipo":"MacBook Air (M2, 2022)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":742.18},{"equipo":"MacBook Air (13-inch, M4, 2025)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":742.18},{"equipo":"MacBook Air (13-inch, M3, 2024) CPU de 8 núcleos, GPU de 10 núcleos","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":786.82},{"equipo":"Macbook Air 13 M4","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":802.65},{"equipo":"MacBook Air (15-inch, M4, 2025)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":802.65},{"equipo":"MacBook Air (15-inch, M3, 2024)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":802.65},{"equipo":"MacBook Air (15-inch, M2, 2023)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":802.65},{"equipo":"iMac (24-inch, 2023, Two ports)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":838.47},{"equipo":"iMac (24-inch, 2024, Two ports)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":838.47},{"equipo":"iMac (24-inch, 2024, Four ports)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":59.18},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":65.14},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":77.05},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":88.96},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":117.11},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":158.81},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":218.37},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":301.75}],"precio_rep":922.2},{"equipo":"MacBook Pro (13-inch, M2, 2022)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":933.62},{"equipo":"MacBook Pro (13\", 2020, Four Thunderbolt 3 ports)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":933.62},{"equipo":"MacBook Pro (13\", 2020, Two Thunderbolt 3 ports)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":933.62},{"equipo":"MacBook Pro (13-inch, M1, 2020)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":933.62},{"equipo":"MacBook Pro (14-inch, M4, 2024)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M3, Nov 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, 2023) Chip M2 Max","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M3 Pro, Nov 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M3 Max, Nov 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, 2021)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M4 Pro or M4 Max, 2024)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":67.95},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":76.42},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":93.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":110.27},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":129.65},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":188.89},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":273.52},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":392.0}],"precio_rep":1070.38},{"equipo":"MacBook Pro (16-inch, 2021)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1176.58},{"equipo":"MacBook Pro (16-inch, Nov 2023) Chip M3 Pro","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, Nov 2023) Chip M3 Max","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, 2023) Chip M2 Pro","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, 2023) Chip M2 Max","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, M4, 2024)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1245.45},{"equipo":"MacBook Pro (16-inch, 2024)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1245.45},{"equipo":"iPad Air 13-inch (M2)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1161.34},{"equipo":"iPad Air 13-inch (M2)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1161.33},{"equipo":"Mac Studio (2022) Chip M1 Max de Apple","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1398.15},{"equipo":"iPad Air 13-inch (M3)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":898.96},{"equipo":"iPad Pro 11-inch (4th generation)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1241.17},{"equipo":"iPad Pro 11-inch (M4)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1189.37},{"equipo":"iPad Pro 13-inch (M4)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1412.47},{"equipo":"iPad Pro 12.9-inch (6th generation)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":92.56},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":105.86},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":132.47},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":159.07},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":171.31},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":264.43},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":397.46},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":566.05}],"precio_rep":1779.03},{"equipo":"iPhone 13","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":600.25},{"equipo":"iPhone 14","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":635.36},{"equipo":"iPhone 15","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":743.71},{"equipo":"iPhone 13 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":747.02},{"equipo":"iPhone 14 Plus","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":818.98},{"equipo":"iPhone 15 Plus","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":827.05},{"equipo":"iPhone 15 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":851.36},{"equipo":"iPhone 14 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":900.51},{"equipo":"iPhone 14 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":926.25},{"equipo":"iPhone 15 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":934.71},{"equipo":"iPhone 15 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":851.36},{"equipo":"iPhone 13 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":721.25},{"equipo":"iPad Air (5.ª generación)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":961.46},{"equipo":"iPad Air (4.ª generación)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":961.46},{"equipo":"iPad Air 11-inch (M2)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":904.57},{"equipo":"iPad Air 11-inch (M3)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":729.89},{"equipo":"iPad (10th generation)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":703.29},{"equipo":"iPad (A16) Wi-Fi","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":517.39},{"equipo":"iPad (9th gen)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":595.71},{"equipo":"iPad mini (A17 Pro)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":676.36},{"equipo":"iPhone 16","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":648.74},{"equipo":"iPhone 16 E","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":407.38},{"equipo":"iPhone 16 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":517.47},{"equipo":"iPhone 16 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":539.42},{"equipo":"iPhone 17","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":425.45},{"equipo":"iPhone 17 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":517.47},{"equipo":"iPhone 17 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":517.47},{"equipo":"iPhone Air","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":517.47},{"equipo":"iPhone 17e","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":48.38},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":52.82},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":61.69},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":72.51},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":97.04},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":130.84},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":172.45},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":234.56}],"precio_rep":407.38}];

/* ── DATA USADO ── */
const DATA_USADO = [{"equipo":"MacBook Air (Retina, 13\", 2020)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":98.88},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":143.34},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":200.17},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":274.28}],"precio_rep":null},{"equipo":"MacBook Air (M1, 2020)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":93.4},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":133.17},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":188.43},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":254.71}],"precio_rep":null},{"equipo":"Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":111.3},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":166.41},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":226.78},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":318.63}],"precio_rep":null},{"equipo":"Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos Ethernet 10 Gb","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":111.3},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":166.41},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":226.78},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":318.63}],"precio_rep":null},{"equipo":"MacBook Air (13-inch, M3, 2024) CPU de 8 núcleos, GPU de 8 núcleos","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":122.04},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":186.36},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":249.8},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":357.0}],"precio_rep":null},{"equipo":"MacBook Air (13-inch, M4, 2025)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":122.04},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":186.36},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":249.8},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":357.0}],"precio_rep":null},{"equipo":"MacBook Air (M2, 2022)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":122.04},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":186.36},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":249.8},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":357.0}],"precio_rep":null},{"equipo":"MacBook Air (13-inch, M3, 2024) CPU de 8 núcleos, GPU de 10 núcleos","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":126.95},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":195.48},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":260.32},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":374.54}],"precio_rep":null},{"equipo":"MacBook Air (15-inch, M2, 2023)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":128.69},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":198.71},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":264.05},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":380.76}],"precio_rep":null},{"equipo":"MacBook Air (15-inch, M3, 2024)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":128.69},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":198.71},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":264.05},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":380.76}],"precio_rep":null},{"equipo":"MacBook Air (15-inch, M4, 2025)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":128.69},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":198.71},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":264.05},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":380.76}],"precio_rep":null},{"equipo":"iMac (24-inch, 2023, Two ports)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":132.63},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":206.03},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":272.5},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":394.83}],"precio_rep":null},{"equipo":"iMac (24-inch, 2024, Two ports)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":132.63},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":206.03},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":272.5},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":394.83}],"precio_rep":null},{"equipo":"iMac (24-inch, 2024, Four ports)","gl_plan":"Ceven StartCareFG","cc_plan":"Ceven StartCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCaFG","precio":141.84},{"canal":"GL","años":3,"sku":"3AGLStartCaFG","precio":223.14},{"canal":"CC","años":2,"sku":"2ACCStartCaFG","precio":292.23},{"canal":"CC","años":3,"sku":"3ACCStartCaFG","precio":427.72}],"precio_rep":null},{"equipo":"MacBook Pro (13-inch, M1, 2020)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":143.1},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":225.47},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":294.92},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":432.21}],"precio_rep":null},{"equipo":"MacBook Pro (13-inch, M2, 2022)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":143.1},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":225.47},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":294.92},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":432.21}],"precio_rep":null},{"equipo":"MacBook Pro (13\", 2020, Four Thunderbolt 3 ports)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":143.1},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":225.47},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":294.92},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":432.21}],"precio_rep":null},{"equipo":"MacBook Pro (13\", 2020, Two Thunderbolt 3 ports)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":143.1},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":225.47},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":294.92},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":432.21}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, 2021)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":152.0},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":242.0},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":314.0},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":464.0}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, 2023)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":152.0},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":242.0},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":314.0},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":464.0}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, 2023) Chip M2 Max","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":152.0},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":242.0},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":314.0},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":464.0}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, M3 Max, Nov 2023)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":152.0},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":242.0},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":314.0},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":464.0}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, M3 Pro, Nov 2023)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":152.0},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":242.0},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":314.0},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":464.0}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, M3, Nov 2023)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":152.0},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":242.0},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":314.0},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":464.0}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, M4, 2024)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":152.0},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":242.0},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":314.0},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":464.0}],"precio_rep":null},{"equipo":"MacBook Pro (14-inch, M4 Pro or M4 Max, 2024)","gl_plan":"Ceven ProfessionalCareFG","cc_plan":"Ceven ProfessionalCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCaFG","precio":158.14},{"canal":"GL","años":3,"sku":"3AGLProCaFG","precio":253.41},{"canal":"CC","años":2,"sku":"2ACCProCaFG","precio":327.16},{"canal":"CC","años":3,"sku":"3ACCProCaFG","precio":485.94}],"precio_rep":null},{"equipo":"MacBook Pro (16-inch, 2021)","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":169.82},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":275.1},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":352.19},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":527.66}],"precio_rep":null},{"equipo":"MacBook Pro (16-inch, 2023) Chip M2 Max","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":171.26},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":277.77},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":355.27},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":532.79}],"precio_rep":null},{"equipo":"MacBook Pro (16-inch, 2023) Chip M2 Pro","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":171.26},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":277.77},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":355.27},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":532.79}],"precio_rep":null},{"equipo":"MacBook Pro (16-inch, Nov 2023) Chip M3 Max","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":171.26},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":277.77},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":355.27},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":532.79}],"precio_rep":null},{"equipo":"MacBook Pro (16-inch, Nov 2023) Chip M3 Pro","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":171.26},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":277.77},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":355.27},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":532.79}],"precio_rep":null},{"equipo":"iPad Pro 11-inch (4th generation)","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":176.93},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":288.3},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":367.42},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":553.03}],"precio_rep":null},{"equipo":"iPad Pro 11-inch (M4)","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":171.23},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":277.71},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":355.21},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":532.68}],"precio_rep":null},{"equipo":"iPad Pro 13-inch (M4)","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":195.77},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":323.29},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":407.8},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":620.33}],"precio_rep":null},{"equipo":"iPad Pro 12.9-inch (6th generation)","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":236.09},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":398.17},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":494.2},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":764.34}],"precio_rep":null},{"equipo":"MacBook Pro (16-inch, 2024)","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":177.4},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":289.17},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":368.43},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":554.71}],"precio_rep":null},{"equipo":"MacBook Pro (16-inch, M4, 2024)","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":177.4},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":289.17},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":368.43},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":554.71}],"precio_rep":null},{"equipo":"Mac Studio (2022) Chip M1 Max de Apple","gl_plan":"Ceven MaxCareFG","cc_plan":"Ceven MaxCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCaFG","precio":169.8},{"canal":"GL","años":3,"sku":"3AGLCMaxCaFG","precio":275.06},{"canal":"CC","años":2,"sku":"2ACCMaxCaFG","precio":352.14},{"canal":"CC","años":3,"sku":"3ACCMaxCaFG","precio":527.57}],"precio_rep":null},{"equipo":"iPhone 13","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":106.43},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":157.37},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":216.35},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":301.24}],"precio_rep":null},{"equipo":"iPhone 13 pro","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":119.74},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":182.08},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":244.87},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":348.78}],"precio_rep":null},{"equipo":"iPhone 13 pro max","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":122.57},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":187.35},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":250.94},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":358.9}],"precio_rep":null},{"equipo":"iPhone 14","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":110.29},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":164.54},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":224.62},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":315.04}],"precio_rep":null},{"equipo":"iPhone 14 Plus","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":130.49},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":202.05},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":267.9},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":387.17}],"precio_rep":null},{"equipo":"iPhone 14 Pro","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":139.46},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":218.7},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":287.12},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":419.2}],"precio_rep":null},{"equipo":"iPhone 14 Pro Max","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":142.29},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":223.96},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":293.19},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":429.31}],"precio_rep":null},{"equipo":"iPhone 15","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":122.21},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":186.67},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":250.16},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":357.6}],"precio_rep":null},{"equipo":"iPhone 15 Plus","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":131.38},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":203.7},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":269.81},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":390.34}],"precio_rep":null},{"equipo":"iPhone 15 Pro","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":134.05},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":208.66},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":275.54},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":399.89}],"precio_rep":null},{"equipo":"iPhone 15 Pro Max","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":143.22},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":225.69},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":295.18},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":432.64}],"precio_rep":null},{"equipo":"iPad Air (5.ª generación)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":146.16},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":231.16},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":301.49},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":443.15}],"precio_rep":null},{"equipo":"iPad Air (4.ª generación)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":146.16},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":231.16},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":301.49},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":443.15}],"precio_rep":null},{"equipo":"iPad Air 11-inch (M2)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":139.9},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":219.53},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":288.08},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":420.79}],"precio_rep":null},{"equipo":"iPad Air 13-inch (M2)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":174.75},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":284.24},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":362.74},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":545.24}],"precio_rep":null},{"equipo":"iPad Air 11-inch (M3)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":120.69},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":183.85},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":246.9},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":352.17}],"precio_rep":null},{"equipo":"iPad Air 13-inch (M3)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":145.89},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":230.65},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":300.9},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":442.17}],"precio_rep":null},{"equipo":"iPad (10th generation)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":117.76},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":178.42},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":240.63},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":341.72}],"precio_rep":null},{"equipo":"iPad (A16) Wi-Fi","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":97.31},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":140.44},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":196.81},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":268.69}],"precio_rep":null},{"equipo":"iPad (9th gen)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":105.93},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":156.44},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":215.28},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":299.46}],"precio_rep":null},{"equipo":"iPad mini (A17 Pro)","gl_plan":"Ceven MovilCareFG","cc_plan":"Ceven MovilCareFG Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCaFG","precio":98.6},{"canal":"GL","años":3,"sku":"3AGLMovilCaFG","precio":142.83},{"canal":"CC","años":2,"sku":"2ACCMovilCaFG","precio":199.57},{"canal":"CC","años":3,"sku":"3ACCMovilCaFG","precio":273.29}],"precio_rep":null}];

/* ── DATA CF (Clientes Finales) ── */
const DATA_CF = [{"equipo":"MacBook Neo Sin Touch ID","gl_plan":"Ceven NeoCare","cc_plan":"Ceven NeoCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLNeoCa","precio":71.12},{"canal":"GL","años":3,"sku":"3AGLNeoCa","precio":82.5},{"canal":"GL","años":4,"sku":"4AGLNeoCa","precio":93.89},{"canal":"GL","años":5,"sku":"5AGLNeoCa","precio":107.55},{"canal":"CC","años":2,"sku":"2ACCNeoCa","precio":143.29},{"canal":"CC","años":3,"sku":"3ACCNeoCa","precio":175.17},{"canal":"CC","años":4,"sku":"4ACCNeoCa","precio":220.71},{"canal":"CC","años":5,"sku":"5ACCNeoCa","precio":284.46}],"precio_rep":354.55},{"equipo":"MacBook Neo Touch ID","gl_plan":"Ceven NeoCare","cc_plan":"Ceven NeoCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLNeoCa","precio":71.12},{"canal":"GL","años":3,"sku":"3AGLNeoCa","precio":82.5},{"canal":"GL","años":4,"sku":"4AGLNeoCa","precio":93.89},{"canal":"GL","años":5,"sku":"5AGLNeoCa","precio":107.55},{"canal":"CC","años":2,"sku":"2ACCNeoCa","precio":143.29},{"canal":"CC","años":3,"sku":"3ACCNeoCa","precio":175.17},{"canal":"CC","años":4,"sku":"4ACCNeoCa","precio":220.71},{"canal":"CC","años":5,"sku":"5ACCNeoCa","precio":284.46}],"precio_rep":356.36},{"equipo":"MacBook Air (Retina, 13\", 2020)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":531.62},{"equipo":"MacBook Air (M1, 2020)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":582.15},{"equipo":"Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":644.51},{"equipo":"Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos Ethernet 10 Gb","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":644.51},{"equipo":"MacBook Air (M2, 2022)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":742.18},{"equipo":"MacBook Air (13-inch, M4, 2025)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":742.18},{"equipo":"MacBook Air (13-inch, M3, 2024) CPU de 8 núcleos, GPU de 10 núcleos","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":786.82},{"equipo":"Macbook Air 13 M4","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":802.65},{"equipo":"MacBook Air (15-inch, M4, 2025)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":802.65},{"equipo":"MacBook Air (15-inch, M3, 2024)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":802.65},{"equipo":"MacBook Air (15-inch, M2, 2023)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":802.65},{"equipo":"iMac (24-inch, 2023, Two ports)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":838.47},{"equipo":"iMac (24-inch, 2024, Two ports)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":838.47},{"equipo":"iMac (24-inch, 2024, Four ports)","gl_plan":"Ceven StartCare","cc_plan":"Ceven StartCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLStartCa","precio":68.06},{"canal":"GL","años":3,"sku":"3AGLStartCa","precio":74.91},{"canal":"GL","años":4,"sku":"4AGLStartCa","precio":88.61},{"canal":"GL","años":5,"sku":"5AGLStartCa","precio":102.3},{"canal":"CC","años":2,"sku":"2ACCStartCa","precio":134.68},{"canal":"CC","años":3,"sku":"3ACCStartCa","precio":182.63},{"canal":"CC","años":4,"sku":"4ACCStartCa","precio":251.12},{"canal":"CC","años":5,"sku":"5ACCStartCa","precio":347.02}],"precio_rep":922.2},{"equipo":"MacBook Pro (13-inch, M2, 2022)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":933.62},{"equipo":"MacBook Pro (13\", 2020, Four Thunderbolt 3 ports)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":933.62},{"equipo":"MacBook Pro (13\", 2020, Two Thunderbolt 3 ports)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":933.62},{"equipo":"MacBook Pro (13-inch, M1, 2020)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":933.62},{"equipo":"MacBook Pro (14-inch, M4, 2024)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M3, Nov 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, 2023) Chip M2 Max","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M3 Pro, Nov 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M3 Max, Nov 2023)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, 2021)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1014.55},{"equipo":"MacBook Pro (14-inch, M4 Pro or M4 Max, 2024)","gl_plan":"Ceven ProfessionalCare","cc_plan":"Ceven ProfessionalCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLProCa","precio":78.15},{"canal":"GL","años":3,"sku":"3AGLProCa","precio":87.88},{"canal":"GL","años":4,"sku":"4AGLProCa","precio":107.34},{"canal":"GL","años":5,"sku":"5AGLProCa","precio":126.81},{"canal":"CC","años":2,"sku":"2ACCProCa","precio":149.1},{"canal":"CC","años":3,"sku":"3ACCProCa","precio":217.22},{"canal":"CC","años":4,"sku":"4ACCProCa","precio":314.55},{"canal":"CC","años":5,"sku":"5ACCProCa","precio":450.8}],"precio_rep":1070.38},{"equipo":"MacBook Pro (16-inch, 2021)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1176.58},{"equipo":"MacBook Pro (16-inch, Nov 2023) Chip M3 Pro","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, Nov 2023) Chip M3 Max","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, 2023) Chip M2 Pro","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, 2023) Chip M2 Max","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1189.64},{"equipo":"MacBook Pro (16-inch, M4, 2024)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1245.45},{"equipo":"MacBook Pro (16-inch, 2024)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1245.45},{"equipo":"iPad Air 13-inch (M2)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1161.34},{"equipo":"iPad Air 13-inch (M2)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1161.33},{"equipo":"Mac Studio (2022) Chip M1 Max de Apple","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1398.15},{"equipo":"iPad Air 13-inch (M3)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":898.96},{"equipo":"iPad Pro 11-inch (4th generation)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1241.17},{"equipo":"iPad Pro 11-inch (M4)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1189.37},{"equipo":"iPad Pro 13-inch (M4)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1412.47},{"equipo":"iPad Pro 12.9-inch (6th generation)","gl_plan":"Ceven MaxCare","cc_plan":"Ceven MaxCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLCMaxCa","precio":106.44},{"canal":"GL","años":3,"sku":"3AGLCMaxCa","precio":121.74},{"canal":"GL","años":4,"sku":"4AGLCMaxCa","precio":152.34},{"canal":"GL","años":5,"sku":"5AGLCMaxCa","precio":182.94},{"canal":"CC","años":2,"sku":"2ACCMaxCa","precio":197.01},{"canal":"CC","años":3,"sku":"3ACCMaxCa","precio":304.1},{"canal":"CC","años":4,"sku":"4ACCMaxCa","precio":457.08},{"canal":"CC","años":5,"sku":"5ACCMaxCa","precio":650.96}],"precio_rep":1779.03},{"equipo":"iPhone 13","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":600.25},{"equipo":"iPhone 14","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":635.36},{"equipo":"iPhone 15","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":743.71},{"equipo":"iPhone 13 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":747.02},{"equipo":"iPhone 14 Plus","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":818.98},{"equipo":"iPhone 15 Plus","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":827.05},{"equipo":"iPhone 15 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":851.36},{"equipo":"iPhone 14 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":900.51},{"equipo":"iPhone 14 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":926.25},{"equipo":"iPhone 15 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":934.71},{"equipo":"iPhone 15 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":851.36},{"equipo":"iPhone 13 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":721.25},{"equipo":"iPad Air (5.ª generación)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":961.46},{"equipo":"iPad Air (4.ª generación)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":961.46},{"equipo":"iPad Air 11-inch (M2)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":904.57},{"equipo":"iPad Air 11-inch (M3)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":729.89},{"equipo":"iPad (10th generation)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":703.29},{"equipo":"iPad (A16) Wi-Fi","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":517.39},{"equipo":"iPad (9th gen)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":595.71},{"equipo":"iPad mini (A17 Pro)","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":676.36},{"equipo":"iPhone 16","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":648.74},{"equipo":"iPhone 16 E","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":407.38},{"equipo":"iPhone 16 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":517.47},{"equipo":"iPhone 16 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":539.42},{"equipo":"iPhone 17","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":425.45},{"equipo":"iPhone 17 Pro","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":517.47},{"equipo":"iPhone 17 Pro Max","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":517.47},{"equipo":"iPhone Air","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":517.47},{"equipo":"iPhone 17e","gl_plan":"Ceven MovilCare","cc_plan":"Ceven MovilCare Complete","planes":[{"canal":"GL","años":2,"sku":"2AGLMovilCa","precio":55.64},{"canal":"GL","años":3,"sku":"3AGLMovilCa","precio":60.74},{"canal":"GL","años":4,"sku":"4AGLMovilCa","precio":70.95},{"canal":"GL","años":5,"sku":"5AGLMovilCa","precio":83.39},{"canal":"CC","años":2,"sku":"2ACCMovilCa","precio":111.59},{"canal":"CC","años":3,"sku":"3ACCMovilCa","precio":150.47},{"canal":"CC","años":4,"sku":"4ACCMovilCa","precio":198.32},{"canal":"CC","años":5,"sku":"5ACCMovilCa","precio":269.74}],"precio_rep":407.38}];

/* ── HELPERS ── */
/* cevencare.html no carga shared/safe.js (es una página aparte, embebida en un
   iframe), así que esta es la misma implementación de cevenEsc(): se usa la
   global si está disponible y si no, la copia local. Todo lo que se interpola en
   innerHTML pasa por acá — en particular el término de búsqueda, que se puede
   inyectar desde afuera con ?q= (ver bootstrapFromURL). */
const esc = (s) => (typeof window.cevenEsc === 'function')
  ? window.cevenEsc(s)
  : (s === null || s === undefined ? '' : String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;'));

const BASE   = 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/';
const PARAMS = '?wid=680&hei=528&fmt=p-jpg&qlt=95';

function deviceImage(name) {
  const n = name.toLowerCase();
  if (n.includes('macbook neo'))    return BASE + 'mac-card-40-macbook-neo-202603' + PARAMS;
  if (n.includes('macbook air'))    return BASE + 'mac-card-40-macbook-air-202503' + PARAMS;
  if (n.includes('macbook pro'))    return BASE + 'mac-card-40-macbookpro-14-16-202410' + PARAMS;
  if (n.includes('imac'))           return BASE + 'mac-card-40-imac-202410' + PARAMS;
  if (n.includes('mac mini'))       return BASE + 'mac-card-40-mac-mini-202410' + PARAMS;
  if (n.includes('mac studio'))     return BASE + 'mac-card-40-mac-studio-202503' + PARAMS;
  if (n.includes('studio display')) return BASE + 'mac-card-40-mac-studio-202503' + PARAMS;
  if (n.includes('iphone air'))     return BASE + 'iphone-card-40-17air-202509' + PARAMS;
  if (n.includes('iphone 17 pro'))  return BASE + 'iphone-card-40-17pro-202509' + PARAMS;
  if (n.includes('iphone 17'))      return BASE + 'iphone-card-40-17-202509' + PARAMS;
  if (n.includes('iphone 16 e'))    return BASE + 'iphone-card-40-17e-202603' + PARAMS;
  if (n.includes('iphone 16 pro'))  return BASE + 'iphone-card-40-17pro-202509' + PARAMS;
  if (n.includes('iphone'))         return BASE + 'iphone-card-40-16plus-202509' + PARAMS;
  if (n.includes('ipad pro'))       return BASE + 'ipad-card-40-pro-202405' + PARAMS;
  if (n.includes('ipad air'))       return BASE + 'ipad-card-40-air-202405' + PARAMS;
  if (n.includes('ipad mini'))      return BASE + 'ipad-card-40-ipad-mini-202410' + PARAMS;
  if (n.includes('ipad'))           return BASE + 'ipad-card-40-ipad-202410' + PARAMS;
  return null;
}

function deviceType(name) {
  const n = name.toLowerCase();
  if (n.includes('iphone'))  return 'iPhone';
  if (n.includes('ipad'))    return 'iPad';
  if (n.includes('macbook')) return 'MacBook';
  if (n.includes('imac'))    return 'iMac';
  if (n.includes('mac mini'))   return 'Mac mini';
  if (n.includes('mac studio')) return 'Mac Studio';
  if (n.includes('mac pro'))    return 'Mac Pro';
  if (n.includes('display'))    return 'Display';
  return 'Apple';
}

function highlight(text, query) {
  if (!query) return esc(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return esc(text);
  // Se escapa cada tramo por separado: el <span> es markup propio, el texto no.
  return esc(text.slice(0, idx)) +
    '<span class="match">' + esc(text.slice(idx, idx + query.length)) + '</span>' +
    esc(text.slice(idx + query.length));
}

// 2 decimales: con maximumFractionDigits:1 los unitarios salían redondeados
// (USD 152.3 en vez de 152.32) mientras el total sumaba los exactos, así que la
// columna del PDF no cerraba contra el total.
function formatPrice(p) {
  return 'USD ' + p.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── STATE ── */
let currentMode = null;
let activeIdx   = -1;
let filtered    = [];

const landingEl     = document.getElementById('landing');
const searchScreenEl = document.getElementById('searchScreen');
const warningBannerEl = document.getElementById('warningBanner');
const modeBadgeEl   = document.getElementById('modeBadge');
const input         = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const resultsEl     = document.getElementById('results');

/* ── MODE SELECTION ── */
function toggleCanales() {
  const btn = document.getElementById('btnCanales');
  const sub = document.getElementById('canales-sub');
  const open = sub.classList.toggle('open');
  btn.classList.toggle('open', open);
}

function selectMode(mode) {
  currentMode = mode;
  landingEl.style.display    = 'none';
  searchScreenEl.style.display = 'flex';
  input.value = '';
  activeIdx   = -1;
  filtered    = [];
  suggestionsEl.style.display = 'none';
  resultsEl.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Escribí el nombre del equipo para ver los planes disponibles</p></div>`;

  if (mode === 'usado') {
    modeBadgeEl.textContent = 'Producto Usado';
    modeBadgeEl.className   = 'mode-badge mode-usado';
    warningBannerEl.style.display = 'flex';
  } else if (mode === 'cf') {
    modeBadgeEl.textContent = 'Clientes Finales';
    modeBadgeEl.className   = 'mode-badge mode-cf';
    warningBannerEl.style.display = 'none';
  } else {
    modeBadgeEl.textContent = 'Producto Nuevo';
    modeBadgeEl.className   = 'mode-badge mode-nuevo';
    warningBannerEl.style.display = 'none';
  }

  setTimeout(() => input.focus(), 100);
}

function resetCanalesMenu() {
  document.getElementById('canales-sub').classList.remove('open');
  document.getElementById('btnCanales').classList.remove('open');
}

function goBack() {
  searchScreenEl.style.display = 'none';
  landingEl.style.display      = 'flex';
  currentMode = null;
  resetCanalesMenu();
}

/* ── SEARCH ── */
input.addEventListener('input', () => {
  const q = input.value.trim();
  activeIdx = -1;

  if (q.length < 1) {
    suggestionsEl.style.display = 'none';
    resultsEl.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Escribí el nombre del equipo para ver los planes disponibles</p></div>`;
    return;
  }

  const data = currentMode === 'usado' ? DATA_USADO : currentMode === 'cf' ? DATA_CF : DATA_NUEVO;
  filtered = data.filter(d => d.equipo.toLowerCase().includes(q.toLowerCase()));

  if (filtered.length === 0) {
    suggestionsEl.style.display = 'none';
    // q lo controla el usuario y también se puede inyectar desde la URL (?q=…).
    resultsEl.innerHTML = `<div class="empty-state"><div class="icon">😔</div><p>No se encontró ningún equipo para <strong>"${esc(q)}"</strong></p></div>`;
    return;
  }

  suggestionsEl.innerHTML = filtered.map((d, i) =>
    `<div class="suggestion-item" data-idx="${i}">
      <span>${highlight(d.equipo, q)}</span>
      <span class="device-type">${esc(deviceType(d.equipo))}</span>
    </div>`
  ).join('');
  suggestionsEl.style.display = 'block';
});

suggestionsEl.addEventListener('click', e => {
  const item = e.target.closest('.suggestion-item');
  if (!item) return;
  selectDevice(filtered[parseInt(item.dataset.idx)]);
});

/* ── PATCH: bootstrap por URL params (?mode=cf|nuevo|usado&q=término) ── */
(function bootstrapFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const q    = params.get('q');
    if (mode && ['cf','nuevo','usado'].includes(mode)) {
      // Esperar a que el DOM esté listo
      setTimeout(() => {
        selectMode(mode);
        if (q) {
          setTimeout(() => {
            input.value = q;
            input.dispatchEvent(new Event('input'));
          }, 80);
        }
      }, 50);
    }
  } catch(e){}
})();

input.addEventListener('keydown', e => {
  const items = suggestionsEl.querySelectorAll('.suggestion-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIdx = Math.min(activeIdx + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIdx = Math.max(activeIdx - 1, 0);
    items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  } else if (e.key === 'Enter') {
    if (activeIdx >= 0 && filtered[activeIdx]) selectDevice(filtered[activeIdx]);
    else if (filtered.length === 1) selectDevice(filtered[0]);
  } else if (e.key === 'Escape') {
    suggestionsEl.style.display = 'none';
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-container')) suggestionsEl.style.display = 'none';
});

/* ── RENDER RESULTS ── */
function selectDevice(device) {
  input.value = device.equipo;
  suggestionsEl.style.display = 'none';

  const glPlanes = device.planes.filter(p => p.canal === 'GL');
  const ccPlanes = device.planes.filter(p => p.canal === 'CC');

  // Cache planos del dispositivo actual para botones directos al cotizador
  window._currentDeviceConsulta = device;

  function renderPlanes(planes) {
    return planes.map((p, i) => {
      const dataAttr = `data-equipo="${esc(device.equipo)}" data-sku="${esc(p.sku)}" data-canal="${esc(p.canal)}" data-años="${esc(p.años)}" data-precio="${esc(p.precio)}"`;
      return `
      <div class="plan-card">
        <div class="years">${esc(p.años)} <span>${p.años === 1 ? 'año' : 'años'}</span></div>
        <div class="price">${esc(formatPrice(p.precio))} <span class="currency">USD</span></div>
        <div class="sku">${esc(p.sku)}</div>
        <button class="plan-card-add plan-card-send" ${dataAttr} onclick="sendPlanToCotizador(this)">📋 Agregar al cotizador</button>
      </div>
    `}).join('');
  }

  const imgUrl = deviceImage(device.equipo);
  const imgTag = imgUrl ? `<img class="device-image" src="${esc(imgUrl)}" alt="${esc(device.equipo)}" onerror="this.style.display='none'">` : '';

  const isNeo = device.equipo.toLowerCase().includes('macbook neo');
  const otrosPrice = isNeo ? 149 : 249;

  const repairHtml = device.precio_rep != null ? `
    <div class="repair-block">
      <div>
        <div class="repair-block-title">Sin cobertura</div>
        <div class="repair-block-label">Precio reparación sin cobertura sin IVA</div>
      </div>
      <div class="repair-block-price">${esc(formatPrice(device.precio_rep))}</div>
    </div>
  ` : '';

  const addonsHtml = `
    <div class="addons-block">
      <div class="addons-header">
        <span class="addons-badge">Add-on</span>
        <span class="addons-label">Cobertura ampliada — Daños accidentales</span>
      </div>
      <div class="addon-row">
        <div>
          <div class="addon-name">Daño en la pantalla</div>
          <div class="addon-sku">DADIACC</div>
        </div>
        <div class="addon-price">USD <span>99</span> <span class="addon-currency">USD</span></div>
      </div>
      <div class="addon-row">
        <div>
          <div class="addon-name">Otros daños</div>
          <div class="addon-sku">OTDAACC</div>
        </div>
        <div class="addon-price">USD <span>${otrosPrice}</span> <span class="addon-currency">USD</span></div>
      </div>
    </div>
  `;

  resultsEl.innerHTML = `
    ${imgTag}
    <div class="result-header">
      <h2>${esc(device.equipo)}</h2>
    </div>

    ${repairHtml}

    <div class="channel-block">
      <div class="channel-label" style="flex-direction:column;align-items:flex-start;gap:3px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="channel-badge badge-gl">GL</span>
          <span class="plan-desc">${esc(device.gl_plan)}</span>
        </div>
        <span class="channel-desc">Cubre fallas de fabricación · Cobertura idéntica a la Garantía Limitada Apple</span>
      </div>
      <div class="planes-grid">${renderPlanes(glPlanes)}</div>
    </div>

    <div class="channel-block">
      <div class="channel-label" style="flex-direction:column;align-items:flex-start;gap:3px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="channel-badge badge-cc">CC</span>
          <span class="plan-desc">${esc(device.cc_plan)}</span>
        </div>
        <span class="channel-desc">Incluye daños accidentales · Sujeto a cargo por servicio</span>
      </div>
      <div class="planes-grid">${renderPlanes(ccPlanes)}</div>
    </div>

    ${addonsHtml}
  `;
}

/* ── T&C DATA ── */
const TC_ARTICLES = [
  {n:"1", t:"Naturaleza del servicio", c:"Ceven Care es un servicio de extensión de la Garantía Limitada de Apple, prestado por Ceven S.A., que replica durante el plazo contratado los mismos alcances, limitaciones, exclusiones y criterios técnicos establecidos en la Garantía Limitada de Apple vigente al momento de la contratación. Ceven Care no constituye una garantía autónoma ni independiente, ni amplía los derechos otorgados por Apple, sino que extiende temporalmente su cobertura, bajo iguales parámetros técnicos y económicos. No sustituye ni reemplaza la garantía legal ni la Garantía Limitada de Apple que acompaña al equipo al momento de su adquisición. Durante la vigencia de la garantía de fábrica y/o de la Garantía Limitada de Apple, dicha cobertura prevalecerá y se aplicará con carácter principal, resultando Ceven Care una extensión complementaria que comenzará a regir una vez vencida aquella, sin superposición de coberturas."},
  {n:"2", t:"Alcance objetivo y subjetivo", c:"El servicio alcanza exclusivamente a los dispositivos cuyos números de serie se encuentren expresamente individualizados en el Anexo correspondiente. Ceven Care no es un paquete de garantías abierto, ni resulta aplicable a equipos no identificados o sustituidos sin autorización expresa."},
  {n:"3", t:"Documentación requerida", c:"Para acceder a cualquier prestación bajo Ceven Care, el cliente deberá presentar: i) Factura o comprobante de compra del equipo; ii) Factura o comprobante de contratación de Ceven Care; iii) Encontrarse registrado en la flota de equipos declarada al momento de la contratación o en sus posteriores actualizaciones. La falta de dicha documentación habilita a Ceven S.A. a denegar la prestación."},
  {n:"4", t:"Responsabilidad sobre la flota declarada", c:"El cliente es única y exclusiva responsable de mantener actualizada, completa y veraz la nómina de equipos que integran su flota cubierta por Ceven Care, incluyendo altas, bajas, sustituciones y cambios de titularidad. Ceven S.A. no asume obligación de control, verificación o actualización de la flota declarada. La cobertura se limita estrictamente a los equipos oportunamente declarados e identificados por su número de serie."},
  {n:"5", t:"Vigencia", c:"La vigencia del servicio será la indicada en el contrato, con un plazo máximo de hasta treinta y seis (36) meses, contados desde el inicio de la cobertura extendida. Durante dicho período, Ceven Care extiende la Garantía Limitada Apple bajo idénticos términos y, cuando así se indique expresamente en el contrato, podrá limitar la cobertura hasta un (1) evento de daño accidental por contrato."},
  {n:"6", t:"Cobertura técnica y exclusiones", c:"Ceven Care cubre únicamente: i) Defectos de fabricación; ii) Fallas de materiales o mano de obra. Quedan expresamente excluidos: a) Daños cosméticos; b) Software; c) Accesorios; d) Daños por uso indebido, negligencia, accidentes no cubiertos; e) Desgaste normal por uso."},
  {n:"7", t:"Daños accidentales y cargos por servicio", c:"Cuando el contrato contemple daños accidentales, la cobertura se limita a un (1) evento por contrato, sujeto a un cargo por servicio a cargo del cliente, equivalente en pesos al tipo de cambio vendedor del Banco de la Nación Argentina del día de facturación, conforme los siguientes valores de referencia: Pantalla (DADIACC): USD 149. Otros daños (OTDAACC): USD 249 (USD 149 para equipos MacBook Neo)."},
  {n:"8", t:"Exchange / Reemplazo de equipo", c:"Aplica exclusivamente para iPhone, iPad y Apple Watch, cuando: i) La falla sea técnicamente no reparable, o ii) El costo de reparación supere el valor de reposición. El equipo de reemplazo podrá ser nuevo o reacondicionado, conforme prácticas de Apple. El reemplazo extingue automáticamente la cobertura Ceven Care, sin derecho a reclamo adicional."},
  {n:"9", t:"Batería", c:"La cobertura de batería se rige exclusivamente por los criterios de Apple: i) Capacidad esperada: hasta 80% a 1000 ciclos; ii) No se cubre desgaste natural ni reemplazos solicitados por el usuario."},
  {n:"10", t:"Originalidad y servicios no autorizados", c:"La cobertura queda sin efecto si el equipo: i) Contiene partes de terceros; ii) Fue intervenido por servicios técnicos no autorizados; iii) Presenta modificaciones de hardware o software no aprobadas por Apple."},
  {n:"11", t:"Intransferibilidad", c:"Ceven Care es personal e intransferible. No puede cederse ni aplicarse a otros equipos."},
  {n:"12", t:"Equipos sustitutos", c:"Los equipos sustitutos son propiedad de Ceven S.A. y se entregan en modalidad de préstamo mientras el equipo del usuario esté en servicio técnico y la reparación supere los cinco (5) días hábiles. El usuario debe devolver el equipo sustituto en iguales condiciones estéticas y funcionales."},
  {n:"13", t:"Partes reemplazadas", c:"Las partes reemplazadas serán devueltas a Apple conforme sus procedimientos. La entrega al cliente requerirá solicitud expresa y podrá implicar un cargo adicional."},
  {n:"14", t:"Plazos de reparación", c:"Los plazos dependen de la disponibilidad de repuestos Apple en el país. En caso de falta de stock, las reparaciones podrán extenderse hasta noventa (90) días corridos, sin generar derecho a compensación."},
  {n:"15", t:"Límite financiero de cobertura", c:"La cobertura cesará automáticamente cuando el costo acumulado de reparaciones y/o reemplazos alcance el valor de mercado del equipo en plaza, conforme los límites implícitos de la Garantía Limitada Apple."},
  {n:"16", t:"Equipos usados o no adquiridos en Ceven", c:"La aceptación está sujeta a inspección técnica conforme estándares Apple, requiriéndose: i) Antigüedad máxima: 4 años; ii) Batería mínima: 90%; iii) Ausencia de daños físicos o manipulación. Ceven S.A. se reserva el derecho de admisión."},
  {n:"17", t:"Lugar de reparación", c:"El servicio se presta exclusivamente en: Manuel García 352, CABA – República Argentina. No incluye traslados ni logística."},
  {n:"18", t:"Responsabilidad por contenidos", c:"Ceven S.A. no asume responsabilidad alguna por pérdida, alteración o eliminación de datos, ni por la confidencialidad o integridad de la información almacenada. El cliente es único responsable del contenido almacenado."},
  {n:"19", t:"Datos, iCloud y bloqueos", c:"Ceven S.A. no responde por bloqueos de activación, cuentas iCloud, claves, accesos o respaldos. La responsabilidad recae íntegramente en el usuario."},
  {n:"20", t:"Robo o hurto", c:"El presente servicio no implica cobertura de riesgos por robo o hurto total ni parcial."},
  {n:"21", t:"Limitación de responsabilidad", c:"En la máxima medida permitida por la ley aplicable, Ceven S.A. no será responsable por daños indirectos, incidentales, especiales, consecuenciales o lucro cesante. La responsabilidad total de Ceven S.A., de existir, no excederá en ningún caso el valor del equipo cubierto."},
  {n:"22", t:"Fuerza mayor", c:"Ceven S.A. no será responsable por incumplimientos derivados de hechos de fuerza mayor, incluyendo desabastecimiento de repuestos, restricciones de importación, conflictos laborales o actos gubernamentales."},
  {n:"23", t:"Modificaciones del servicio", c:"Ceven S.A. se reserva el derecho de modificar estos Términos y Condiciones para adecuarlos a cambios en la política de Apple, normativa aplicable o condiciones técnicas, sin afectar derechos ya adquiridos."},
  {n:"24", t:"Marco normativo Apple", c:'Ceven Care se rige conforme a la Garantía Limitada Apple, disponible en: <a href="https://www.apple.com/legal/warranty/products/warranty-alac-spanish.html" target="_blank" class="apple-link">apple.com/legal/warranty</a>'},
  {n:"25", t:"No acumulable con otras garantías", c:"Ceven Care no es acumulable con otras garantías, seguros o planes de protección que cubran el mismo equipo."},
  {n:"26", t:"Ley aplicable y jurisdicción", c:"El presente servicio se rige por las leyes de la República Argentina. Toda controversia será sometida a la jurisdicción de los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires."},
  {n:"27", t:"Aceptación", c:"La contratación de Ceven Care implica la aceptación plena, expresa e irrevocable de los presentes Términos y Condiciones."}
];

const FAQ_CLIENTE = [
  {s:"Sobre el servicio"},
  {q:"¿Qué es CevenCare?", a:"CevenCare es un plan de extensión de la Garantía Limitada Apple ofrecido por Ceven S.A. Cubre los mismos defectos de fabricación que cubre Apple, pero por un período adicional de 2, 3, 4 o 5 años según el plan elegido."},
  {q:"¿CevenCare reemplaza la garantía de fábrica de Apple?", a:"No. CevenCare comienza a aplicar una vez vencida la garantía original de Apple. Durante la garantía de fábrica, prevalece la cobertura Apple. CevenCare es una extensión complementaria, excepto que exista un daño accidental cubierto por Ceven Care Complete."},
  {q:"¿Cuánto tiempo dura la cobertura?", a:"Según el plan contratado: 2, 3, 4 o 5 años a partir de la fecha de compra de la garantía. La duración exacta figura en el contrato y en el comprobante de contratación."},
  {s:"Cobertura"},
  {q:"¿Qué cubre CevenCare?", a:"Cubre defectos de fabricación y fallas de materiales o mano de obra, bajo los mismos criterios que la Garantía Limitada Apple. En los planes que lo incluyen, también cubre daños accidentales (un evento por contrato)."},
  {q:"¿Qué NO cubre CevenCare?", a:"Quedan excluidos: daños cosméticos, software, accesorios, daños por uso indebido o negligencia, desgaste normal por uso, robo o hurto, y pérdida de datos."},
  {q:"¿Cubre la batería?", a:"Solo si la capacidad cae por debajo del 80% antes de los 1000 ciclos de carga, conforme los criterios de Apple. El desgaste natural no está cubierto."},
  {q:"¿Qué es la cobertura de daños accidentales (CC)?", a:"Es el plan 'Complete' que, además de fallas de fabricación, cubre un (1) evento de daño accidental por contrato. Requiere el pago de un cargo por servicio: USD 99 para daños en pantalla (DADIACC), USD 149 para otros daños en MacBook Neo (OTDAACC) y USD 249 para otros daños en el resto de los equipos (OTDAACC). Esos valores se facturan al tipo de cambio vendedor del Banco Nación del día."},
  {s:"Uso del servicio"},
  {q:"¿Qué documentación necesito para hacer una reparación?", a:"Necesitás presentar: 1) Factura o comprobante de compra del equipo, 2) Factura o comprobante de contratación de CevenCare, y 3) Estar registrado en la flota declarada al momento de la contratación."},
  {q:"¿Dónde se realiza la reparación?", a:"Exclusivamente en Manuel García 352, CABA, República Argentina. El servicio no incluye traslados ni logística."},
  {q:"¿Cuánto tarda una reparación?", a:"Depende de la disponibilidad de repuestos Apple en el país. En caso de falta de stock, puede extenderse hasta 90 días corridos sin derecho a compensación."},
  {q:"¿Me dan un equipo sustituto mientras reparan el mío?", a:"Sí, si la reparación supera los 5 días hábiles. El equipo sustituto es propiedad de Ceven S.A. y se presta hasta que se entregue el equipo reparado. Debés devolverlo en las mismas condiciones."},
  {q:"¿Qué pasa si mi equipo no tiene reparación posible?", a:"Para iPhone, iPad y Apple Watch, si la falla no tiene reparación técnica o el costo supera el valor del equipo, se ofrece un reemplazo (nuevo o reacondicionado). El reemplazo cancela automáticamente la cobertura restante."},
];

const FAQ_CANAL = [
  {s:"Activación y elegibilidad"},
  {q:"¿Qué equipos son elegibles para CevenCare?", a:"Los equipos que figuran en el cotizador, identificados por modelo. Los planes varían por categoría: NeoCare (MacBook Neo), StartCare (MacBook Air, iMac, Mac mini, iPad estándar), ProfessionalCare (MacBook Pro 13\"/14\"), MaxCare (MacBook Pro 16\", Mac Studio, iPad Pro, iPad Air 13\"), MovilCare (iPhone, iPad, iPad mini)."},
  {q:"¿Cómo se activa la cobertura?", a:"El equipo debe estar declarado con su número de serie al momento de la contratación (o en actualizaciones posteriores). La cobertura no aplica a equipos no declarados o incorporados sin autorización expresa."},
  {q:"¿Se puede vender CevenCare a un cliente con un equipo usado?", a:"Sí, con los planes FG (Fuera de Garantía). Están disponibles en 2 y 3 años. La aceptación está sujeta a inspección técnica: el equipo debe tener como máximo 4 años de antigüedad, batería mínima del 90% y sin daños físicos o manipulaciones."},
  {q:"¿La cobertura es transferible si el cliente vende su equipo?", a:"No. CevenCare es personal e intransferible. No puede cederse ni aplicarse a otro equipo o titular."},
  {s:"Operativa del canal"},
  {q:"¿Qué pasa si el cliente no actualiza su flota?", a:"La responsabilidad de mantener actualizada la flota recae íntegramente en el cliente. Ceven S.A. no se hace cargo de equipos no declarados o declarados fuera de plazo."},
  {q:"¿Dónde se hacen efectivas las reparaciones?", a:"Exclusivamente en Manuel García 352, CABA. No se cubren traslados. Los canales deben informar esto al cliente al momento de la venta."},
];

const FAQ_VENDEDOR = [
  {s:"Cómo presentar los planes"},
  {q:"¿Cuál es la diferencia entre un plan GL y un plan CC (Complete)?", a:"• GL (azul): cubre fallas de fabricación, exactamente igual que la Garantía Limitada Apple. No cubre daños accidentales. Ideal para clientes que cuidan mucho sus equipos y quieren la cobertura esencial al menor costo.\n• CC — Complete (naranja): todo lo del GL más cobertura de daños accidentales (1 evento por contrato). El cliente paga un cargo adicional si usa esta cobertura: USD 149 para pantalla y USD 249 para otros daños."},
  {q:"¿Cómo explico la diferencia de precio entre 2, 3, 4 y 5 años?", a:"A mayor plazo, mayor tranquilidad. El costo por año es más bajo en planes más largos. Podés mostrar la diferencia directamente en el cotizador: el cliente ve cada año y su precio en USD."},
  {q:"¿Qué son los planes FG (Fuera de Garantía)?", a:"Son los planes para equipos usados. Se activan después de una inspección técnica de Ceven S.A. Están disponibles en 2 y 3 años."},
  {q:"¿Qué son los add-ons DADIACC y OTDAACC?", a:"Son los cargos por servicio que paga el cliente cuando activa la cobertura de daños accidentales (plan CC).\n• DADIACC: cargo por daño en pantalla → USD 99\n• OTDAACC: cargo por otros daños → USD 249 (USD 149 para MacBook Neo).\nEstos valores se convierten a pesos al tipo de cambio vendedor del Banco Nación el día de la facturación."},
  {s:"Argumentos de venta"},
  {q:"¿Por qué comprar CevenCare en lugar de quedarse sin cobertura?", a:"La Garantía Limitada Apple dura solo 1 año. Pasado ese período, cualquier falla corre por cuenta del cliente. Una reparación típica puede superar los USD 500–1000. CevenCare protege esa inversión por años, a una fracción del costo de una reparación."},
  {q:"¿Cómo refuerzo la venta del plan CC (Complete)?", a:"Mostrá el 'Precio reparación sin cobertura sin IVA' que figura en el cotizador: es el costo real de reparar el equipo sin cobertura. Luego comparalo con el precio del plan CC + el cargo por servicio. La diferencia justifica ampliamente la inversión."},
];

function renderChevron() {
  return `<svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
}

function buildAccordion() {
  const el = document.getElementById('tcAccordion');
  el.innerHTML = TC_ARTICLES.map(a => `
    <div class="accordion-item">
      <button class="accordion-btn" onclick="toggleAccordion(this)">
        <span class="accordion-btn-title">Art. ${esc(a.n)} — ${esc(a.t)}</span>
        ${renderChevron()}
      </button>
      <div class="accordion-content">${esc(a.c)}</div>
    </div>
  `).join('');
}

function buildFAQ(data, containerId) {
  const el = document.getElementById(containerId);
  el.innerHTML = data.map(item => {
    if (item.s) return `<div class="faq-section-title">${esc(item.s)}</div>`;
    return `
      <div class="faq-item">
        <button class="faq-q" onclick="toggleFAQ(this)">
          <span>${esc(item.q)}</span>
          <svg class="faq-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="faq-a">${esc(item.a).replace(/\n/g,'<br>')}</div>
      </div>
    `;
  }).join('');
}

function toggleAccordion(btn) {
  btn.parentElement.classList.toggle('open');
}

function toggleFAQ(btn) {
  btn.parentElement.classList.toggle('open');
}


function openModal() {
  if (!document.getElementById('tcAccordion').children.length) {
    buildAccordion();
    buildFAQ([...FAQ_CLIENTE, ...FAQ_CANAL, ...FAQ_VENDEDOR], 'faqCombinado');
  }
  document.getElementById('tcModal').classList.add('open');
}

function closeModal() {
  document.getElementById('tcModal').classList.remove('open');
}

function closeTCModal(e) {
  if (e.target === document.getElementById('tcModal')) closeModal();
}

/* ════════════════════════════════════════
   PRESUPUESTO
════════════════════════════════════════ */
const budgetAudienceEl = document.getElementById('budgetAudienceScreen');
const budgetScreenEl   = document.getElementById('budgetScreen');
const budgetSearchEl   = document.getElementById('budgetSearch');
const budgetSuggEl     = document.getElementById('budgetSugg');
const budgetResultsEl  = document.getElementById('budgetResults');
const cartItemsEl      = document.getElementById('cartItems');
const budgetTotalAmtEl = document.getElementById('budgetTotalAmt');
const budgetTotalCntEl = document.getElementById('budgetTotalCount');
const budgetPdfBtnEl   = document.getElementById('budgetPdfBtn');

let budgetItems    = [];
let budgetTab      = 'nuevo';
let budgetAudience = 'canales'; // 'canales' | 'cf'
let budgetFiltered = [];
let budgetActIdx   = -1;
let budgetItemId   = 0;
let budgetPlanCache = [];

/* ── Navegación ── */
function openBudget() {
  landingEl.style.display        = 'none';
  budgetAudienceEl.style.display = 'flex';
}

function goBackFromAudience() {
  budgetAudienceEl.style.display = 'none';
  landingEl.style.display        = 'flex';
  resetCanalesMenu();
}

function selectAudience(audience) {
  budgetAudience = audience;
  budgetAudienceEl.style.display = 'none';
  budgetScreenEl.style.display   = 'flex';

  const tabNuevo = document.getElementById('btab-nuevo');
  const tabUsado = document.getElementById('btab-usado');
  const tabCF    = document.getElementById('btab-cf');

  if (audience === 'canales') {
    tabNuevo.style.display = '';
    tabUsado.style.display = '';
    tabCF.style.display    = 'none';
    setBudgetTab('nuevo');
  } else {
    tabNuevo.style.display = 'none';
    tabUsado.style.display = 'none';
    tabCF.style.display    = '';
    setBudgetTab('cf');
  }

  setTimeout(() => budgetSearchEl.focus(), 100);
}

function goBackFromBudget() {
  budgetScreenEl.style.display   = 'none';
  budgetAudienceEl.style.display = 'flex';
}

// ── Escape / botón Atrás: salir de la sub-pantalla actual ────────────────────
// Fase de captura: si hay una lista de sugerencias abierta, cedemos el Escape al
// input para que la cierre primero. Si no, volvemos de la pantalla más profunda;
// ya en el landing avisamos al contenedor (iframe padre) para cerrar CevenCare.
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  try{
    if(suggestionsEl && suggestionsEl.style.display && suggestionsEl.style.display !== 'none') return;
    if(budgetSuggEl   && budgetSuggEl.style.display   && budgetSuggEl.style.display   !== 'none') return;
  }catch(_e){}
  if(budgetScreenEl && budgetScreenEl.style.display === 'flex'){ goBackFromBudget(); }
  else if(budgetAudienceEl && budgetAudienceEl.style.display === 'flex'){ goBackFromAudience(); }
  else if(searchScreenEl && searchScreenEl.style.display === 'flex'){ goBack(); }
  else { try{ window.parent.postMessage({ type:'cevencare-close' }, '*'); }catch(_p){} }
}, true);

/* ── Tabs ── */
function setBudgetTab(tab) {
  budgetTab = tab;
  ['nuevo','usado','cf'].forEach(t => {
    const el = document.getElementById('btab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  budgetSearchEl.value = '';
  budgetFiltered  = [];
  budgetActIdx    = -1;
  budgetPlanCache = [];
  budgetSuggEl.style.display = 'none';
  budgetResultsEl.innerHTML  = `<div class="empty-state"><div class="icon">🔍</div><p>Escribí el nombre del equipo para ver los planes disponibles</p></div>`;
}

/* ── Búsqueda ── */
budgetSearchEl.addEventListener('input', () => {
  const q = budgetSearchEl.value.trim();
  budgetActIdx = -1;
  if (q.length < 1) {
    budgetSuggEl.style.display = 'none';
    budgetResultsEl.innerHTML  = `<div class="empty-state"><div class="icon">🔍</div><p>Escribí el nombre del equipo para ver los planes disponibles</p></div>`;
    return;
  }
  const src = budgetTab === 'usado' ? DATA_USADO : budgetTab === 'cf' ? DATA_CF : DATA_NUEVO;
  budgetFiltered = src.filter(d => d.equipo.toLowerCase().includes(q.toLowerCase()));
  if (!budgetFiltered.length) {
    budgetSuggEl.style.display = 'none';
    budgetResultsEl.innerHTML  = `<div class="empty-state"><div class="icon">😔</div><p>No se encontró <strong>"${esc(q)}"</strong></p></div>`;
    return;
  }
  budgetSuggEl.innerHTML = budgetFiltered.map((d, i) =>
    `<div class="suggestion-item" data-idx="${i}">
       <span>${highlight(d.equipo, q)}</span>
       <span class="device-type">${esc(deviceType(d.equipo))}</span>
     </div>`
  ).join('');
  budgetSuggEl.style.display = 'block';
});

budgetSuggEl.addEventListener('click', e => {
  const item = e.target.closest('.suggestion-item');
  if (item) selectBudgetDevice(budgetFiltered[+item.dataset.idx]);
});

budgetSearchEl.addEventListener('keydown', e => {
  const items = budgetSuggEl.querySelectorAll('.suggestion-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); budgetActIdx = Math.min(budgetActIdx + 1, items.length - 1); items.forEach((el, i) => el.classList.toggle('active', i === budgetActIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); budgetActIdx = Math.max(budgetActIdx - 1, 0); items.forEach((el, i) => el.classList.toggle('active', i === budgetActIdx)); }
  else if (e.key === 'Enter') { if (budgetActIdx >= 0 && budgetFiltered[budgetActIdx]) selectBudgetDevice(budgetFiltered[budgetActIdx]); else if (budgetFiltered.length === 1) selectBudgetDevice(budgetFiltered[0]); }
  else if (e.key === 'Escape') budgetSuggEl.style.display = 'none';
});

document.addEventListener('click', e => {
  if (!e.target.closest('#budgetScreen .search-container')) budgetSuggEl.style.display = 'none';
});

/* ── Render de planes con botón Agregar ── */
function selectBudgetDevice(device) {
  budgetSearchEl.value       = device.equipo;
  budgetSuggEl.style.display = 'none';

  // Guardar planes en cache con índice numérico seguro
  budgetPlanCache = device.planes.map(p => ({
    equipo:   device.equipo,
    gl_plan:  device.gl_plan,
    cc_plan:  device.cc_plan,
    canal:    p.canal,
    años:     p.años,
    sku:      p.sku,
    precio:   p.precio,
    tipo:     budgetTab
  }));

  function renderPlanesConBtn(planes) {
    return planes.map((p, globalIdx) => {
      const idx = budgetPlanCache.findIndex(c => c.canal === p.canal && c.años === p.años);
      const dataAttr = `data-equipo="${esc(device.equipo)}" data-sku="${esc(p.sku)}" data-canal="${esc(p.canal)}" data-años="${esc(p.años)}" data-precio="${esc(p.precio)}"`;
      return `
        <div class="plan-card">
          <div class="years">${esc(p.años)} <span>${p.años === 1 ? 'año' : 'años'}</span></div>
          <div class="price">${esc(formatPrice(p.precio))} <span class="currency">USD</span></div>
          <div class="sku">${esc(p.sku)}</div>
          <button class="plan-card-add" onclick="addToBudget(${idx})">+ Agregar al presupuesto</button>
          <button class="plan-card-add plan-card-send" ${dataAttr} onclick="sendPlanToCotizador(this)" style="margin-top:6px">📋 Agregar al cotizador</button>
        </div>`;
    }).join('');
  }

  const gl = device.planes.filter(p => p.canal === 'GL');
  const cc = device.planes.filter(p => p.canal === 'CC');

  budgetResultsEl.innerHTML = `
    <div class="result-header"><h2>${esc(device.equipo)}</h2></div>
    ${gl.length ? `
    <div class="channel-block">
      <div class="channel-label" style="flex-direction:column;align-items:flex-start;gap:3px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="channel-badge badge-gl">GL</span>
          <span class="plan-desc">${esc(device.gl_plan)}</span>
        </div>
        <span class="channel-desc">Cubre fallas de fabricación · Cobertura idéntica a la Garantía Limitada Apple</span>
      </div>
      <div class="planes-grid">${renderPlanesConBtn(gl)}</div>
    </div>` : ''}
    ${cc.length ? `
    <div class="channel-block">
      <div class="channel-label" style="flex-direction:column;align-items:flex-start;gap:3px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="channel-badge badge-cc">CC</span>
          <span class="plan-desc">${esc(device.cc_plan)}</span>
        </div>
        <span class="channel-desc">Incluye daños accidentales · Sujeto a cargo por servicio</span>
      </div>
      <div class="planes-grid">${renderPlanesConBtn(cc)}</div>
    </div>` : ''}
  `;
}

/* ── Carrito ── */
function addToBudget(cacheIdx) {
  const src  = budgetPlanCache[cacheIdx];
  if (!src) return;
  const key  = src.equipo + '|' + src.tipo + '|' + src.canal + '|' + src.años;
  const existing = budgetItems.find(i => i.key === key);
  if (existing) {
    existing.cantidad++;
  } else {
    budgetItems.push({ ...src, key, id: budgetItemId++ , cantidad: 1 });
  }
  renderCart();

  // Flash feedback en el botón
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = '✓ Agregado';
  btn.style.background = '#34c759';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 900);
}

function removeFromBudget(id) {
  budgetItems = budgetItems.filter(i => i.id !== id);
  renderCart();
}

function updateQty(id, delta) {
  const item = budgetItems.find(i => i.id === id);
  if (!item) return;
  item.cantidad = Math.max(1, item.cantidad + delta);
  renderCart();
}

function clearCart() {
  if (!budgetItems.length) return;
  budgetItems = [];
  renderCart();
}

function tipoBadgeSmall(tipo) {
  if (tipo === 'usado') return `<span class="mode-badge mode-usado" style="font-size:10px;padding:2px 8px;line-height:1.4;">Usado Canales</span>`;
  if (tipo === 'cf')    return `<span class="mode-badge mode-cf"    style="font-size:10px;padding:2px 8px;line-height:1.4;">Clientes Finales</span>`;
  return `<span class="mode-badge mode-nuevo" style="font-size:10px;padding:2px 8px;line-height:1.4;">Nuevo Canales</span>`;
}

function renderCart() {
  if (!budgetItems.length) {
    cartItemsEl.innerHTML      = '<div class="cart-empty">Tocá "+ Agregar" en los planes de arriba para armar el presupuesto</div>';
    budgetTotalAmtEl.textContent = 'USD 0';
    budgetTotalCntEl.textContent = '0 equipos';
    budgetPdfBtnEl.disabled      = true;
    const sendBtn = document.getElementById('budgetSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    return;
  }

  let total = 0, totalUnits = 0;
  cartItemsEl.innerHTML = budgetItems.map(item => {
    const sub = item.precio * item.cantidad;
    total      += sub;
    totalUnits += item.cantidad;
    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${esc(item.equipo)}</div>
          <div class="cart-item-meta">
            ${tipoBadgeSmall(item.tipo)}
            <span class="channel-badge badge-${String(item.canal).toLowerCase() === 'cc' ? 'cc' : 'gl'}" style="font-size:10px;padding:2px 8px;">${esc(item.canal)}</span>
            <span>${esc(item.años)} años · ${esc(item.sku)}</span>
          </div>
          <div class="cart-item-subtotal">${esc(formatPrice(sub))} <span style="color:#6e6e73;font-size:12px;font-weight:400;">USD</span></div>
          <div class="cart-item-unit-price">${esc(formatPrice(item.precio))} USD × ${esc(item.cantidad)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;flex-shrink:0;">
          <div class="qty-control">
            <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
            <span class="qty-value">${esc(item.cantidad)}</span>
            <button class="qty-btn" onclick="updateQty(${item.id},  1)">+</button>
          </div>
          <button class="cart-remove-btn" onclick="removeFromBudget(${item.id})" title="Eliminar">✕</button>
        </div>
      </div>`;
  }).join('');

  // formatPrice() ya devuelve el prefijo "USD": el total imprimía "USD USD 1.234".
  budgetTotalAmtEl.textContent = formatPrice(total);
  budgetTotalCntEl.textContent = totalUnits + ' equipo' + (totalUnits !== 1 ? 's' : '');
  budgetPdfBtnEl.disabled      = false;
  const sendBtn = document.getElementById('budgetSendBtn');
  if (sendBtn) sendBtn.disabled = false;
}

/* ── Enviar UN plan individual directamente al cotizador (vista consulta) ── */
function sendPlanToCotizador(btn) {
  const equipo = btn.dataset.equipo;
  const sku    = btn.dataset.sku;
  const canal  = btn.dataset.canal;
  const años   = parseInt(btn.dataset.años);
  const precio = parseFloat(btn.dataset.precio);

  const payload = [{ equipo, sku, canal, años, precio, cantidad: 1, tipo: currentMode || 'nuevo' }];

  const target = window.parent !== window ? window.parent : window.opener;
  if (target) {
    target.postMessage({ type: 'cevencare-add-warranty', items: payload }, CC_TARGET_ORIGIN);
    const orig = btn.textContent;
    btn.textContent = '✓ Agregado';
    btn.style.background = '#34c759';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1400);
  } else {
    alert('Abrí CevenCare desde dentro del cotizador para transferir garantías.');
  }
}

/* ── Enviar garantías al cotizador principal ── */
function sendToCotizador() {
  if (!budgetItems.length) return;
  const payload = budgetItems.map(item => ({
    equipo:   item.equipo,
    sku:      item.sku,
    canal:    item.canal,
    años:     item.años,
    precio:   item.precio,
    cantidad: item.cantidad,
    tipo:     item.tipo,
    gl_plan:  item.gl_plan,
    cc_plan:  item.cc_plan
  }));
  // Enviar al cotizador padre (si está en iframe) o a window.opener
  const target = window.parent !== window ? window.parent : window.opener;
  if (target) {
    target.postMessage({ type: 'cevencare-add-warranty', items: payload }, CC_TARGET_ORIGIN);
    // Feedback visual
    const btn = document.getElementById('budgetSendBtn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Enviado al cotizador';
      btn.style.background = '#34c759';
      setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1800);
    }
  } else {
    alert('Abrí CevenCare desde dentro del cotizador para poder transferir las garantías.');
  }
}

/* ── Modal cliente ── */
function openClientModal() {
  document.getElementById('clientModal').classList.add('open');
  setTimeout(() => document.getElementById('clientNombre').focus(), 100);
}

function closeClientModal() {
  document.getElementById('clientModal').classList.remove('open');
}

function closeClientModalOutside(e) {
  if (e.target === document.getElementById('clientModal')) closeClientModal();
}

/* ── Generación de PDF ── */
function generatePDF() {
  const nombre  = document.getElementById('clientNombre').value.trim();
  const empresa = document.getElementById('clientEmpresa').value.trim();
  const cuit    = document.getElementById('clientCUIT').value.trim();
  const repNom  = document.getElementById('repNombre').value.trim();
  const repMail = document.getElementById('repEmail').value.trim();
  const repTel  = document.getElementById('repTel').value.trim();

  const now     = new Date();
  const dateStr = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const quoteId = 'CC-' + now.getFullYear()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + '-' + String(Math.floor(Math.random() * 9000) + 1000);

  closeClientModal();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14; // margen
  let y = M;

  // ── HEADER: marca ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(0, 86, 184);
  doc.text('CevenCare', M, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(134, 134, 139);
  doc.text('Planes de servicio · Ceven S.A.', M, y + 13);

  // Badge "ceven | Apple Business Partner"
  const badgeX = M + 62, badgeY = y;
  doc.setDrawColor(210, 210, 215);
  doc.setLineWidth(0.3);
  doc.roundedRect(badgeX, badgeY, 58, 16, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 86, 184);
  doc.text('ceven', badgeX + 5, badgeY + 9);
  doc.setDrawColor(210, 210, 215);
  doc.setLineWidth(0.3);
  doc.line(badgeX + 20, badgeY + 2, badgeX + 20, badgeY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(29, 29, 31);
  doc.text('Apple Business Partner', badgeX + 24, badgeY + 6.5);
  doc.text('Authorized Service Provider', badgeX + 24, badgeY + 11);

  // Número y fecha (alineado a la derecha)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(29, 29, 31);
  doc.text(quoteId, W - M, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 115);
  doc.text('Fecha: ' + dateStr, W - M, y + 11, { align: 'right' });

  // Línea separadora
  y += 20;
  doc.setDrawColor(29, 29, 31);
  doc.setLineWidth(0.5);
  doc.line(M, y, W - M, y);
  y += 7;

  // ── DATOS DEL CLIENTE Y REPRESENTANTE ──
  const hasClient = nombre || empresa || cuit;
  const hasRep    = repNom || repMail || repTel;

  if (hasClient || hasRep) {
    const colW = (W - M * 2) / 2;
    const startY = y;

    if (hasClient) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(110, 110, 115);
      doc.text('DATOS DEL CLIENTE', M, y);
      y += 4.5;
      [['Cliente:', nombre], ['Empresa:', empresa], ['CUIT/DNI:', cuit]]
        .filter(([, v]) => v)
        .forEach(([label, value]) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(110, 110, 115);
          doc.text(label, M, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(29, 29, 31);
          doc.text(value, M + 22, y);
          y += 4.5;
        });
    }

    if (hasRep) {
      const rx = M + colW + 4;
      let ry = startY;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(110, 110, 115);
      doc.text('REPRESENTANTE DE VENTAS', rx, ry);
      ry += 4.5;
      [['Representante:', repNom], ['Email:', repMail], ['Teléfono:', repTel]]
        .filter(([, v]) => v)
        .forEach(([label, value]) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(110, 110, 115);
          doc.text(label, rx, ry);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(29, 29, 31);
          doc.text(value, rx + 28, ry);
          ry += 4.5;
        });
      y = Math.max(y, ry);
    }
    y += 5;
  }

  // ── TABLA DE ÍTEMS ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 115);
  doc.text('DETALLE DEL PRESUPUESTO', M, y);
  y += 3;

  let total = 0;
  const tableBody = budgetItems.map(item => {
    const sub  = item.precio * item.cantidad;
    total += sub;
    const tipo = item.tipo === 'usado' ? 'Usado Canales' : item.tipo === 'cf' ? 'Clientes Finales' : 'Nuevo Canales';
    return [item.equipo, tipo, item.canal + ' ' + item.años + ' años', item.sku, item.cantidad, formatPrice(item.precio), formatPrice(sub)];
  });

  doc.autoTable({
    startY: y,
    head: [['Equipo', 'Tipo', 'Plan', 'SKU', 'Cant.', 'P. Unit. USD', 'Subtotal USD']],
    body: tableBody,
    foot: [['', '', '', '', '', 'TOTAL USD', formatPrice(total)]],
    margin: { left: M, right: M },
    headStyles: {
      fillColor: [245, 245, 247], textColor: [110, 110, 115],
      fontStyle: 'bold', fontSize: 7.5, cellPadding: 3
    },
    bodyStyles: { fontSize: 8.5, textColor: [29, 29, 31], cellPadding: 2.5 },
    footStyles: {
      fontSize: 9.5, fontStyle: 'bold', textColor: [29, 29, 31],
      fillColor: [255, 255, 255], lineWidth: { top: 0.5 }
    },
    columnStyles: {
      0: { cellWidth: 52 },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      if (data.section === 'foot' && data.column.index === 5) {
        data.cell.styles.textColor = [110, 110, 115];
        data.cell.styles.fontStyle = 'normal';
        data.cell.styles.halign    = 'right';
      }
    }
  });

  y = doc.lastAutoTable.finalY + 7;

  // ── NOTA ──
  doc.setFillColor(249, 249, 251);
  const noteText = '* Los precios están expresados en dólares estadounidenses (USD) y no incluyen IVA. La facturación se realiza en pesos argentinos al tipo de cambio vendedor del Banco de la Nación Argentina del día de facturación. Los planes están sujetos a los Términos y Condiciones de CevenCare. Presupuesto válido por 7 días hábiles desde su emisión.';
  const noteLines = doc.splitTextToSize(noteText, W - M * 2 - 8);
  const noteH = noteLines.length * 3.8 + 7;
  doc.roundedRect(M, y, W - M * 2, noteH, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(134, 134, 139);
  doc.text(noteLines, M + 4, y + 5);
  y += noteH + 6;

  // ── FOOTER ──
  doc.setDrawColor(232, 232, 237);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(134, 134, 139);
  doc.text('Ceven S.A. · Manuel García 352, CABA, República Argentina', W / 2, y, { align: 'center' });

  doc.save('CevenCare-' + quoteId + '.pdf');
}


