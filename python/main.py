'''Main.py
Runs the main code.'''
import os, time, matplotlib.pyplot as plt
import statistics

import numpy, dateutil.relativedelta

from lastdotfm.client import LastFMClient
import datetime, pytz, logging, spotipy
from spotipy.oauth2 import SpotifyClientCredentials

#Last.FM Stuff
client = LastFMClient(os.environ["LAST_FM_API_KEY"])

#Spotify stuff
sp_client = spotipy.Spotify(client_credentials_manager=SpotifyClientCredentials())
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.DEBUG
)
#Get scrobbles from selected time period
now = datetime.datetime.now(tz=pytz.timezone("Europe/Stockholm"))
last_fm_username = "coolaalbin"
start_time = now - datetime.timedelta(days=2) #datetime.datetime(year=2022, month=4, day=9).astimezone(tz=pytz.timezone("Europe/Stockholm"))
end_time = now
scrobbles = client.get_scrobbles_for_user(last_fm_username, start_time, end_time)
logger.info(f"Retrieved {len(scrobbles)} scrobbles from Last.FM.")

#Now, look up the tracks and try to find BPM counts for each one.
found_bpm_counts = {} #BPM counts sorted by unix timestamps
xaxis = [] #Goes from 1-->number of scrobbles
yaxis = [] #Shows BPM
xaxis_labels = [] #Shows scrobble times
i = 0

"""Now, check what we want on the X-axis. For a plot with data
that are from the same day, we want the labels on the X-axis
to be split by hour.
For a plot with data stretching over multiple days, we want to
also stretch the X-axis labels over multiple days.
"""
time_between_start_and_end = dateutil.relativedelta.relativedelta(end_time, start_time)
if time_between_start_and_end.days < 1:
    if time_between_start_and_end.hours <= 1:
        logger.info("The x-axis will not be split")
        calculate_average_for = None #Don't make the values on the axis averaged
    else:
        logger.info("Splitting the X-axis by hours.")
        calculate_average_for = "hour" #Split the x-axis by hour
else:
    logger.info("Splitting the X-axis by days.")
    calculate_average_for = "day" #Split the x-axis by days
buffer = [[], None]  #We want the x-axis to be split (see above). So we keep a lil' buffer for it
scrobbles.reverse() #We do this to get the oldest scrobbles first.
logger.info("Iterating through scrobbles...")
for scrobble in scrobbles:
    #Check what information is available or the track and do some pre-validations
    if "name" not in scrobble:
        logger.warning(f"Track name not available for scrobble \"{scrobble}\", skipping...")
        continue
    elif "date" not in scrobble or "uts" not in scrobble["date"]:
        logger.warning(f"Scrobble time not available for scrobble \"{scrobble}\", skipping...")
        continue
    track_name = scrobble["name"]
    query = f"track:{track_name} "
    if "artist" in scrobble and "#text" in scrobble["artist"]:
        artist_name = scrobble["artist"]["#text"]
        query += f"artist:{artist_name}"
    else:
        logger.warning(f"Artist name not available for scrobble \"{scrobble}\", skipping...")
        continue
    track_search = sp_client.search(q=query,
                 type="track",
                 limit=1)
    if len(track_search["tracks"]["items"]) == 0:
        logger.warning(f"No track found for search {track_search}!")
        continue
    else:
        logger.info("Found track.")
        track = track_search["tracks"]["items"][0]
        track_uri = track["uri"]
    #Do audio analysis
    track_audio_analysis = sp_client.audio_analysis(track_uri)
    if "track" not in track_audio_analysis or "tempo" not in track_audio_analysis["track"]:
        logger.warning(f"No audio analysis found for track {track_search}.")
        continue
    #Here, we can simply extract the BPM and we're basically done!
    track_bpm = track_audio_analysis["track"]["tempo"]
    scrobble_timestamp = datetime.datetime.fromtimestamp(int(scrobble["date"]["uts"])) #Get when the scrobble was scrobbled
    #We might want to add averaged values to the X-axis. If so, the code for that is right here!
    if calculate_average_for == None:
        yaxis.append(track_bpm)
        xaxis_labels.append(str(scrobble_timestamp.strftime("%H:%M")))
    elif calculate_average_for == "hour":
        buffer_check_value = scrobble_timestamp.hour
        xaxis_format = "%H:00-%H:59"
    elif calculate_average_for == "day":
        buffer_check_value = scrobble_timestamp.date()
        xaxis_format = "%Y-%m-%d"
    else:
        logger.critical(f"Unknown buffer split value \"{calculate_average_for}\".")
        exit()
    if calculate_average_for != None:
        #Check if buffer has been exceeded and handle that accordingly
        if buffer[1] != None and buffer[1] != buffer_check_value:
            logger.debug(f"Rotating {calculate_average_for} buffer...")
            yaxis.append(statistics.mean(buffer[0]))
            xaxis_labels.append(scrobble_timestamp.strftime(xaxis_format))
            buffer[0] = [track_bpm]
            buffer[1] = buffer_check_value
        else: #If the buffer shouldn't be rotated
            buffer[0].append(track_bpm)
        if buffer[1] == None:
            buffer[1] = buffer_check_value
    logger.info(f"At track {i+1}/{len(scrobbles)}")
    logger.debug(f"Buffer is at {buffer}.")
    i += 1
    time.sleep(0.5) #Sleep a little to be nice to the Spotify API

#Convert plotting data:
xaxis = list(range(len(xaxis_labels)))
plt.rcParams["text.color"] = "white"
fig = plt.figure()
BACKGROUND_COLOR = "#1c1e21"
fig.patch.set_facecolor(BACKGROUND_COLOR) #Set background backhround color
ax = plt.subplot(111)
ax.patch.set_facecolor(BACKGROUND_COLOR) #Set background color
#Set color of axises:
ax.xaxis.label.set_color("white")
ax.yaxis.label.set_color("white")
#Set color of axis ticks
ax.tick_params(axis="x", colors="white")
ax.tick_params(axis="y", colors="white")
plt.tight_layout() #Set tight layout
#Add text
ax.title.set_text("Song BPM")
plt.xlabel("Time for listen")
plt.ylabel("Average BPM for listened tracks" if calculate_average_for != None else "BPM")
#Change color of the spines
for spine_name in ["left", "right", "bottom", "top"]:
    ax.spines[spine_name].set_color("white")
plt.xticks(rotation=90) #Rotate xticks
#Make room for text by adding some extra spacing
plt.subplots_adjust(bottom=0.2, left=0.2)
plot = plt.plot(xaxis_labels, yaxis, color="#505ac7")
DATE_FORMAT = "%Y_%m_%d_%H_%M" #Date format to use for filename
fig.savefig(f"{start_time.strftime(DATE_FORMAT)}-{end_time.strftime(DATE_FORMAT)}.png") #Doesn't work properly
plt.show()
