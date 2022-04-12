'''Client.py
A simple Last.FM API client'''
import datetime
import logging, requests
import time

import pytz


class LastFMClient:
    def __init__(self, api_key:str):
        self.api_key = api_key
        self.logger = logging.getLogger(__name__)

    def request(self, api_method, *args, **kwargs):
        '''Sends a request to the Last.FM API.
        Passes on any args and kwargs to the requests.request() function.'''
        if "params" not in kwargs:
            kwargs["params"] = {}
        if "method" not in kwargs["params"]: #Default method: GET
            kwargs["method"] = "GET"
        #Add request parameters for Last.FM
        kwargs["params"]["method"] = api_method #Add the request method
        kwargs["params"]["format"] = "json" #Add the format
        kwargs["params"]["api_key"] = self.api_key #Add the API key
        kwargs["url"] = "http://ws.audioscrobbler.com/2.0/" #Add the URL
        #Make the request
        self.logger.info("Making request to Last.FM API...")
        return requests.request(*args, **kwargs)

    def get_scrobbles_for_user(self, username:str, from_timestamp:datetime.datetime, to_timestamp:datetime.datetime, limit:int=200, page:int=1):
        '''Gets the scrobbles for a user.'''
        scrobbles_list = [] #List of all scrobbles
        current_page = page
        while True: #While not all scrobbles have been retrieved
            #Construct the request parameters
            params = {
                "from": round(from_timestamp.astimezone(tz=pytz.UTC).timestamp()), #Convert the timestamps to a UNIX timestamp
                "to": round(to_timestamp.astimezone(tz=pytz.UTC).timestamp()),
                "user": username,
                "limit": limit,
                "page": current_page
            }
            request = self.request("user.getRecentTracks", params=params) #Make the request

            #Add the scrobbles to the list
            scrobbles_list.extend(request.json()["recenttracks"]["track"])
            #Check if we need to make another request
            if request.json()["recenttracks"]["@attr"]["totalPages"] == str(current_page):
                self.logger.info("Done. Retrieved all tracks.")
                break #No more pages
            self.logger.info("Sleeping one second until requesting next Last.FM page...")
            time.sleep(1) #Sleep a little between requests
            current_page += 1
        return scrobbles_list #Return the list of scrobbles
