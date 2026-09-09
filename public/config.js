window.RUNTIME_CONFIG = {
    //API: "http://gis.tes.com.pk:29881",
    API: "http://172.29.100.24:8081",
    AUTHENTICATE: "http://172.29.100.28:2000",
    //AUTHENTICATE: "http://gis.tes.com.pk:28200",
    //Realtime: "http://gis.tes.com.pk:29543",
    Realtime:"http://172.29.100.24:5432",

    // Where someone without an account is sent to ask for one. Set SUPPORT_URL
    // to your service-desk / SR portal; leave it blank to fall back to a
    // mailto: link to SUPPORT_EMAIL. Blank both and the sign-in and sign-up
    // screens just tell the user to contact the GIS Admin.
    SUPPORT_URL: "",
    SUPPORT_EMAIL: "gis.admin@tes.com.pk"
};
