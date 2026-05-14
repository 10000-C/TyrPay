import {Composition} from 'remotion';
import {TyrPayOpening5s} from './TyrPayOpening5s';
import {OpeningClaim} from './scenes/OpeningClaim';
import {RiskReveal} from './scenes/RiskReveal';
import {TyrPayGate} from './scenes/TyrPayGate';
import {CommitmentOnChain} from './scenes/CommitmentOnChain';
import {EscrowFunding} from './scenes/EscrowFunding';
import {TeeTLSExecution} from './scenes/TeeTLSExecution';
import {ProofStorage} from './scenes/ProofStorage';
import {Verification} from './scenes/Verification';
import {Verdict} from './scenes/Verdict';
import {BuiltOnZeroGClose} from './scenes/BuiltOnZeroGClose';
import {FirstFivePreview, firstFivePreviewDuration} from './FirstFivePreview';
import {FullDemoVideo, fullDemoVideoDuration} from './FullDemoVideo';

export const Root = () => {
  return (
    <>
      <Composition
        id="OpeningClaim8s"
        component={OpeningClaim}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="RiskReveal9s"
        component={RiskReveal}
        durationInFrames={270}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TyrPayGate9s"
        component={TyrPayGate}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="CommitmentOnChain11s"
        component={CommitmentOnChain}
        durationInFrames={330}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="EscrowFunding10s"
        component={EscrowFunding}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TeeTLSExecution12s"
        component={TeeTLSExecution}
        durationInFrames={420}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ProofStorage8s"
        component={ProofStorage}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Verification10s"
        component={Verification}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Verdict6s"
        component={Verdict}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="BuiltOnZeroGClose5s"
        component={BuiltOnZeroGClose}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="FirstFivePreview"
        component={FirstFivePreview}
        durationInFrames={firstFivePreviewDuration}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="FullDemoVideo"
        component={FullDemoVideo}
        durationInFrames={fullDemoVideoDuration}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="TyrPayOpening5s"
        component={TyrPayOpening5s}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
