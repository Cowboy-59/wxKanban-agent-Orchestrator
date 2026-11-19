# settings definition #

settings should include items for managing overall settings of the application. this should be generic enough to handle adding a setting with a unique name, type of setting [boolean,default,report header,image]
and value as variant
settings are global to the current company, and should be stored in the companies record as json encrypted to insure someone cannot change settings outside of the admin Panel  Login should load in session the companies record and settings as well as userprofile of login.
 