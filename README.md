web-audio-calibration
=====================

Audio calibration (latency and gain) for Web Audio browsers

    npm install;
    npm start

Clients connect to <http://localhost:8888/> for calibration. To control
the server, <http://localhost:8888/ctl>

## WAC 15 ##

    data/web-audio-calibration_wac15.json

These data were obtained during the first
[Web Audio Conference](http://wac.ircam.fr), thank to the help of the
participants.

Please note the version of the file, which is available within the
file: `"web-audio-calibration.version": "0.1.2"` This must, and will,
change for the next measurement.

The server emits a pseudo-periodic command (with `setTimeout`), via a
web socket, to the clients. One client is arbitrarily already
calibrated, and serves as a reference. (In our case, an iPod touch.)
Then, *every measure is relative*. (We doubled-check other devices of
the same type to the reference.)

In any case, one device's speaker must point toward one ear, both devices
at the same distance.

First we compensate the delay using a click signal (time of signal is
0.05 ms). It may change depending on the server, the wifi connection,
etc. We manually adjust the delay, to compensate the reference device.

Then we adjust the gain, using a white noise (time of signal is 500
ms).

Why do we adjust by listening? Well, the problem is ambiguous. The
delay varies a lot, and the gain depends on the speaker's orientation,
on the position of the hand holding the device. And the frequency
responses differ among the devices, too. One other reason is that it
is possible to do it anywhere, with a little care, in a limited time.

When a device is calibrated, the parameters are stored on the device
(via `localStorage`) and on the server (with the user-agent
string). When a device connects to the server, it tries to
reload the local data, or to get data from the server.

    Server Software -> Server OS -> Server Hardware
                                           |
                                           v
                                       Transport
                                           |
                                           v
    Client Software <- Client OS <- Client Hardware
                  \
                   \-> Client OS -> Client Hardware
                                           |
                                           v
                                     Transport (air)
                                           |
                                           v
                                       Listener

Delay is *everywhere*.

Gain may occur due to:

- client software
- client OS
- client hardware
- distance from the speaker
- listener

As a first result, the measurement seems reproducible, and the
devices exhibit very different characteristics. Across the extrema,
there is 400 ms and 30 dB.

## Next steps ##

### Network latency ###

The network delay varies a lot, depending on the situation (server,
network, load on client). Thus, we will need to estimate it for each new
situation. But we can suppose that the audio delay is fixed (on a
given converter buffer size, operating system, and hardware).

Then, we would like to decouple the transmission delay, and the audio
delay, by:

- a synchronisation of the clocks, between the server and the clients
- a preliminary measure of the web socket latency

### Hardware information ###

We gain information about the client's device via its user-agent,
which is fine the browser, and OS, but insufficient for the hardware
version.
