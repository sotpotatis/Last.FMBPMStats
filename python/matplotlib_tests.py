import random, numpy as np
import matplotlib.pyplot as plt, os, datetime, matplotlib.ticker as ticker
n_datapoints = 100
xaxis_labels = [(datetime.datetime.now() + datetime.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n_datapoints)]
yaxis = [random.uniform(0, 100) for i in range(n_datapoints)]
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
plt.tight_layout()
ax.title.set_text("Song BPM")
plt.xlabel("Time for listen")
plt.ylabel("Average BPM count")
for spine_name in ["left", "right", "bottom", "top"]:
    ax.spines[spine_name].set_color("white")
plt.xticks(rotation=90) #Rotate xticks
plot = plt.plot(xaxis_labels, yaxis, color="#ccdbab")
plt.show()
