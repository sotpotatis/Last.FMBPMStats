// Set up clients
var _0x8966=["\x39\x62\x32\x30\x35\x31\x32\x32\x33\x30\x35\x65\x34\x35\x62\x34\x62\x38\x35\x39\x61\x33\x63\x36\x38\x64\x36\x39\x37\x37\x34\x61","\x38\x30\x34\x37\x32\x32\x62\x32\x63\x65\x65\x65\x34\x30\x37\x36\x62\x39\x35\x32\x33\x63\x39\x34\x65\x30\x39\x65\x65\x66\x35\x65","\x30\x34\x37\x62\x37\x34\x32\x30\x37\x66\x34\x35\x31\x30\x36\x66\x65\x36\x64\x35\x37\x66\x33\x37\x66\x61\x62\x61\x65\x62\x64\x35","\x31\x61\x64\x64\x37\x65\x61\x37\x31\x65\x65\x33\x61\x35\x36\x31\x65\x32\x66\x33\x31\x32\x62\x33\x36\x34\x38\x65\x31\x32\x66\x62"];let spotify_client_id=_0x8966[0];let spotify_client_secret=_0x8966[1];let last_fm_api_key=_0x8966[2];let last_fm_api_secret=_0x8966[3]

var cache = new LastFMCache()
var lastfm = new LastFM({
    apiUrl    : "https://ws.audioscrobbler.com/2.0/", // We need HTTPS!
    apiKey    : last_fm_api_key,
    apiSecret : last_fm_api_secret,
    cache     : cache
});
var spotify = new SpotifyWebApi();

// Set up table
var table = new Tabulator("#tracks-table", {
    columns:[
        {title:"Track name", field:"name", sorter:"string", width:200, editor:false},
        {title:"Track artist", field:"artist", sorter:"string", width:200, editor:false},
        {title:"Track album", field:"album", sorter:"string", width:200, editor:false},
        {title:"Scrobbled at", field:"scrobble_time", sorter:"date", sorterParams:{format: "yyyy-MM-dd HH:mm"}, width:200, editor:false},
        {title:"BPM", field:"bpm", sorter:"number", width:200, editor:false},
        {title:"BPM confidence", field:"bpm_confidence", sorter:"number", width:200, editor:false},
    ]})

// Set up events for when loading data has been finished
const allLastFMTracksLoaded = new Event('allLastFMTracksLoaded'); // This will trigger when all your scrobbles have been loaded
const allSpotifyTracksLoaded = new Event('allSpotifyTracksLoaded'); // This will trigger when all Spotify Audio Analysis tracks have been loaded
const spotifyAccessTokenRenewed = new Event('spotifyAccessTokenRenewed')
console.log("Last.FM BPM Scrobble Checker! by Albin.")

// Set up variables
let last_fm_scrobble_data = [];
let current_last_fm_page = 1;
let spotify_track_analysis_data = null;
let start_time = luxon.DateTime.now().toLocal().minus({hours:1});
let end_time = luxon.DateTime.now().toLocal();
let skipped_tracks = 0;
let spotifyRateLimitedUntil = null;
let table_data = [];
let chart = null; // Chart object for the BPM chart

function last_fm_error_handler(code, message){
    console.log("Error returned from Last.FM.")
    alert("Error! Last.FM responded with an error. Status code: " + code + ", message: " + message)
    not_loading()
}
function spotify_error_handler(error){
    console.log("Error returned from Spotify.")
    alert("Error! Spotify responded with an error: " + error.status + ". Please try again later.")
    not_loading()
}

function loading(){
    // Hide top bar and show loading screen
    $("#loading").show()
    $("#top").hide()
    $("#chart-wrapper").hide()
    $("#tracks-wrapper").show()
    $("#footer").hide()
}
function not_loading(show_results=true){
    // Show everything again
    $("#loading").hide()
    $("#top").show()
    if (show_results === true){
        $("#chart-wrapper").show()
        $("#tracks-wrapper").show()
        $("#footer").show()
    }
    else {
        $("#chart-wrapper").hide()
        $("#tracks-wrapper").hide()
        $("#footer").hide()
    }
}

not_loading(false);
// Periodically refresh Spotify auth token
function refresh_spotify_auth_token(){
    console.log("Renewing Spotify access token...")
    let body = {
        grant_type: "client_credentials"
    }
    let authorization_header = btoa(spotify_client_id + ":" + spotify_client_secret).toString("base64")
    authorization_header = "Basic " + authorization_header // Finalize authorization header
    let headers = {
        "Authorization": authorization_header
    }
    $.ajax({
        url: "https://accounts.spotify.com/api/token",
        type: "POST",
        data: body,
        headers: headers,
        dataType: "json"}).done(function(data){
        spotify.setAccessToken(
            data.access_token
        )
        setTimeout( // Query token refresh
            refresh_spotify_auth_token,
            (data.expires_in-5)*1000
        )
        document.dispatchEvent(spotifyAccessTokenRenewed);
        console.log("Access token refreshed for Spotify.");
        $("#spotify_details_retrieved").text("Spotify details retrieved: Yup!") // Update that details has been loaded
    }).fail(function(code, message){
        alert("Failed to renew access token for Spotify. Please try to come back to the app later.")
        not_loading()
    })

}
function get_all_scrobbles_for(last_fm_username, start_time, end_time, page=1){
    /* Function to get scrobbles for a user. */
    console.log("Getting scrobbles for " + last_fm_username + " from " + start_time + " to " + end_time + "(page: " + page +")")
    lastfm.user.getRecentTracks({
            from: start_time,
            to: end_time,
            user: last_fm_username,
            limit: 200,
            page: page
        },
        {success: function (data){
                console.log("Got data from Last.FM: ")
                console.log(data)
                last_fm_scrobble_data.push(...data.recenttracks.track);
                // Check if more pages have to be retrieved
                total_pages = data["recenttracks"]["@attr"]["totalPages"]
                $("#last_fm_pages_loaded").text("Last.FM pages loaded: " + page + "/" + total_pages) // Update how many pages that has been loaded
                if (total_pages <= current_last_fm_page){
                    console.log("Done with retrieving pages from Last.FM.")
                    document.dispatchEvent(allLastFMTracksLoaded) // Indicate that all Last.FM tracks have been loaded
                }
                else if (total_pages > 50){
                    alert("The time period that you have specified includes too many scrobbles! The maximum for this tool is 10,000 scrobbles.")
                }
                else {
                    console.log("More Last.FM pages left to retrieve.")
                    current_last_fm_page += 1
                    get_all_scrobbles_for(last_fm_username, start_time, end_time, current_last_fm_page)
                }

            },
            error: last_fm_error_handler})
}

function wait_until_all_spotify_tracks_have_been_loaded(){
    /* Read the function name, duh. */
    if (spotify_track_analysis_data.length+skipped_tracks === last_fm_scrobble_data.length){
        console.log("Last track has been reached!")
        document.dispatchEvent(allSpotifyTracksLoaded);
    }
    else {
        setTimeout(wait_until_all_spotify_tracks_have_been_loaded, 100) // Re-check in a little while
    }
}

function rate_limited_from_spotify(error){
    /* Checks if we have been rate limited from Spotify */
    console.log("Handling an error. Checking rate limit...")
    if (error.status === 429){
        console.log("Yes, we have been rate limited! I'm holdin' it off baby!")
        spotifyRateLimitedUntil = parseInt(error.getResponseHeader("Retry-After"), 10) * 1000 // Multiply be
        console.log("We are rate limited for " + (spotifyRateLimitedUntil/1000).toString() + " more seconds.")
        return true;
    }
    else {
        console.log("No, we haven't been rate limited. I'm throwing another error...")
        spotify_error_handler(error)
        return false;
    }
}
function find_spotify_track(track, track_index){
    /* Function for finding a Spotify track.
    The track argument should be a scrobble data from Last.FM.
     */
    // Retrieve Spotify data
    let query = undefined // This is the query to send to Spotify
    if (track["artist"] !== null && track["artist"]["#text"] !== null){
        let track_name = track["name"]
        let artist_name = track["artist"]["#text"]
        query = "track:" + track_name + " artist:" + artist_name
    }
    else {
        console.log("WARNING! Artist not available for track " + track_name + ". It will be excluded.")
        return
    }
    console.log("Finding track " + query + "...")
    // First, try to find the track
    spotify.searchTracks(
        query,
        {
            limit: 1
        }
    ).then(function(response){
        get_track_analysis_for(response, track, track_index, query)
    }, function(error){
        if (rate_limited_from_spotify(error)){ // Handle rate limits
            console.log("Triggering re-query after rate limited time.")
            setTimeout(find_spotify_track.bind(null, track, track_index), spotifyRateLimitedUntil)
        }
    })
}
function get_track_analysis_for(spotify_track, scrobble_info, track_index, query){
    /* Gets track analysis for a certain Spotify track. */
    if (spotify_track.tracks.items.length === 0){
        console.log("NOTE:  Track "+ query +  "is not available on Spotify.")
        skipped_tracks += 1
        return // Skip the track
    }
    let track_data = spotify_track.tracks.items[0]
    let track_id = track_data["id"]
    console.log("Track found. Getting audio analysis for track ID: " + track_id + "...")
    spotify.getAudioAnalysisForTrack(
        track_id
    ).then(function(data){
            console.log("Audio analysis retrieved for track "  + track_id + ".")
            spotify_track_analysis_data.push({ // Add audio analysis
                audio_analysis: data,
                track_info: track_data,
                scrobble_information: scrobble_info
            })
            // Update the table
            // Add artist and album
            let album_name = "Unknown"
            let artist_name = "Unknown"
            if (scrobble_info["artist"] !== undefined && scrobble_info["artist"]["#text"] !== undefined){
                artist_name = scrobble_info["artist"]["#text"]
            }
            if (scrobble_info["album"] !== undefined && scrobble_info["album"]["#text"] !== undefined){
                album_name = scrobble_info["album"]["#text"]
            }
            let scrobble_time = parseInt(scrobble_info["date"]["uts"], 10)*1000 // Convert to milliseconds
            let table_element_data = {
                name: scrobble_info["name"],
                artist: artist_name,
                album: album_name,
                scrobble_time: luxon.DateTime.fromMillis(scrobble_time).toLocal().toFormat("yyyy-MM-dd HH:mm"),
                bpm: data.track.tempo,
                bpm_confidence: data.track.tempo_confidence
            }
            table_data.push(table_element_data)
            table.setData(table_data)
            table.setSort([ // Sort by scrobble time by default
                {column:"scrobble_time", dir:"dsc"}
            ])
            $("#spotify_pages_loaded").text("BPM loaded for tracks: " + (spotify_track_analysis_data.length+skipped_tracks).toString() + "/" + last_fm_scrobble_data.length) // Update how many pages that has been loaded

        },
        function(error){
            // Check if we have been rate-limited
            if (rate_limited_from_spotify(error)){ // Handle rate limits
                console.log("Triggering re-query after rate limited time.")
                setTimeout(get_track_analysis_for.bind(null, spotify_track, scrobble_info, track_index, query), spotifyRateLimitedUntil)
            }
        })
}
function get_all_track_analysis(){
    /* Retrieves track analysis for all tracks. */
    spotify_track_analysis_data = []
    console.log(last_fm_scrobble_data)
    last_fm_scrobble_data.forEach(find_spotify_track)
    wait_until_all_spotify_tracks_have_been_loaded();
}

function renderGraphAndStuff(){
    /*
    This is the (most) exciting function (at least for the end user)!
    It takes all the data that has been downloaded and turns it into a graph.
    */
    console.log("Rendering all data!")
    let buffer = [[], null, null]
    // Check how we should split the graph
    let difference_between_start_and_end = luxon.Interval.fromDateTimes(start_time, end_time)
    console.log(difference_between_start_and_end)
    let split_x_axis_into = null
    console.log("Days difference: " + difference_between_start_and_end.length("days").toString())
    if (difference_between_start_and_end.length("days") < 1){
        if (Math.round(difference_between_start_and_end.length("hours")) <= 1 || spotify_track_analysis_data.length < 50){
            console.log("The x-axis will not be split.")
        }
        else {
            console.log("The x-axis will be split by hours.")
            split_x_axis_into = "hour" // Split the x-axis based by hours
        }

    }
    else {
        console.log("The x-axis will be split by days.")
        split_x_axis_into = "day" // Split the x-axis based by days
    }
    let dataset_labels = []; // This will be the things on the x-axis
    let dataset_data = []; // This will be the BPM
    // Sort data
    console.log("Sorting data...")
    function sort_by_scrobbled_time(entry_1, entry_2){
        /* Used for sorting list elements by scrobble time */
        let entry_1_timestamp = parseInt(entry_1.scrobble_information["date"]["uts"], 10)
        let entry_2_timestamp = parseInt(entry_2.scrobble_information["date"]["uts"], 10)
        return entry_1_timestamp - entry_2_timestamp; // Return the difference in unix timestamps to compare
    }
    console.log("Data sorted.")
    spotify_track_analysis_data.sort(sort_by_scrobbled_time)
    spotify_track_analysis_data.forEach(
        function(element, index){
            let track_scrobble_information = element.scrobble_information
            let track_information = element.track_info
            let track_audio_analysis = element.audio_analysis
            let scrobble_time = parseInt(track_scrobble_information["date"]["uts"], 10)*1000 // Convert to milliseconds
            let scrobble_time_parsed = new luxon.DateTime.fromMillis(scrobble_time).toLocal()
            let track_bpm = track_audio_analysis.track.tempo
            // Check buffer
            let buffer_check_value = null;
            let xaxis_format = null
            if (split_x_axis_into === null){
                dataset_labels.push(scrobble_time_parsed.toFormat("HH:mm"))
                dataset_data.push(track_bpm)
            }
            else if (split_x_axis_into === "hour"){
                xaxis_format = "HH':00'-HH:'59'"
                buffer_check_value = scrobble_time_parsed.hour
            }
            else if (split_x_axis_into === "day"){
                xaxis_format = "yyyy-LL-dd"
                buffer_check_value = scrobble_time_parsed.toFormat(xaxis_format)
            }
            // Check if we should rotate the buffer
            if (split_x_axis_into !== null && (buffer[1] === null || index === spotify_track_analysis_data.length-1) || buffer[1] !== buffer_check_value){
                console.log("Rotating buffer... (check value " + buffer_check_value + ", current buffer value: " + buffer[1] + ").")
                console.log(buffer[0].length.toString() + " items in current buffer")
                if (buffer[1] !== null){
                    let buffer_sum = 0
                    // Calculate mean value
                    for (let i=0;  i<buffer[0].length; i++){
                        buffer_sum += parseInt(buffer[0][i], 10)
                    }
                    let label = buffer[2]
                    let mean_value = buffer_sum/buffer[0].length
                    console.log("Label: " + label + ", mean value: " + mean_value)
                    dataset_data.push(mean_value)
                    dataset_labels.push(label)
                }
                buffer[0] = [track_bpm]
                buffer[1] = buffer_check_value
                buffer[2] = scrobble_time_parsed.toFormat(xaxis_format)
            }
            else {
                buffer[0].push(track_bpm)
            }
            if (index === spotify_track_analysis_data.length-1){
                console.log("We are at the last track in the dataset. Rendering graph...")
                const ctx = document.getElementById("chart").getContext("2d")
                // Determine dataset label
                let dataset_label;
                if (split_x_axis_into === null){
                    dataset_label = "BPM"
                }
                else {
                    dataset_label = "Average BPM for tracks"
                }
                if (chart !== null){
                    console.log("Destroying old chart...")
                    chart.destroy()
                }
                chart = new Chart(
                    ctx, {
                        type: "line",
                        data: {
                            labels: dataset_labels,
                            datasets: [{
                                label: dataset_label,
                                data: dataset_data,
                                borderColor: "#505ac7"
                            }]
                        },
                        options: {
                            plugins: {
                                title: {
                                    display: true,
                                    text: "BPM statistics for your scrobbles"
                                }
                            }
                        }
                    }
                )
                console.log("Chart rendered. All done!")
                not_loading()
            }

        }
    )
}

let start_time_form_input = $("#start_time")
let end_time_form_input = $("#end_time")
let start_time_form_input_js = document.getElementById("start_time")
let end_time_form_input_js = document.getElementById("end_time")
function handleFormClick(){
    console.log("The form was clicked! Handling click...")
    loading()
    // Reset variables
    last_fm_scrobble_data = [];
    current_last_fm_page = 1;
    spotify_track_analysis_data = null;
    skipped_tracks = 0
    spotifyRateLimitedUntil = null;
    table_data = [];
    let username = $("#last_fm_username").val();
    let start_time_raw = start_time_form_input.val();
    let end_time_raw = end_time_form_input.val();
    // Convert start and end times
    start_time = luxon.DateTime.fromISO(start_time_raw);
    end_time = luxon.DateTime.fromISO(end_time_raw);
    if (start_time > end_time){
        alert("The start time that you have entered is after the end time. Please check those values and try again.")
        not_loading()
        return false;
    }
    get_all_scrobbles_for(username, Math.round(start_time.toUTC().toSeconds()), Math.round(end_time.toUTC().toSeconds()))
    return false;
}
document.addEventListener(
    "allLastFMTracksLoaded",
    refresh_spotify_auth_token
)
function onSpotifyTokenRefresh(){
    console.log("Spotify access token refreshed.")
    if (spotify_track_analysis_data === null){
        console.log("Looks like it is time to retrieve the track analysis.")
        get_all_track_analysis()
    }
}
document.addEventListener(
    "spotifyAccessTokenRenewed",
    onSpotifyTokenRefresh
)

document.addEventListener(
    "allSpotifyTracksLoaded",
    renderGraphAndStuff
)

// Try to edit the value of the date pickers
const js_date_format = "yyyy-LL-dd'T'HH:mm"
start_time_form_input_js.value = luxon.DateTime.now().toLocal().minus({days: 3}).toFormat(js_date_format)
end_time_form_input_js.value = luxon.DateTime.now().toLocal().toFormat(js_date_format)


function setDatePreset(datePresetName){
    /* Apply some presets
    that people can use to easier fill out the date pickers. */
    console.log("Applying date preset...")
    let startDate = null;
    let endDate = null;
    if (datePresetName === "month"){
        startDate = luxon.DateTime.now().toLocal().startOf("month")
        endDate = luxon.DateTime.now().toLocal()
    }
    else if (datePresetName === "week"){
        startDate = luxon.DateTime.now().toLocal().startOf("week").startOf("day")
        endDate = luxon.DateTime.now().toLocal()
    }
    else if (datePresetName === "last_week"){
        startDate = luxon.DateTime.now().toLocal().minus({days: 7}).startOf("day")
        endDate = luxon.DateTime.now().toLocal()
    }
    else if (datePresetName === "day"){
        startDate = luxon.DateTime.now().toLocal().startOf("day")
        endDate = luxon.DateTime.now().toLocal()
    }
    else if (datePresetName === "hour"){
        startDate = luxon.DateTime.now().toLocal().startOf("hour")
        endDate = luxon.DateTime.now().toLocal()
    }
    start_time_form_input_js.value = startDate.toFormat(js_date_format);
    end_time_form_input_js.value = endDate.toFormat(js_date_format);
}
