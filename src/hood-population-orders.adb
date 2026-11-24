with Hood.Floats;
with Hood.Population.Crews;
with Hood.Population.Walk;
with Hood.Population.Transport;

package body Hood.Population.Orders is

   use Hood.Population.Crews;
   use Hood.Floats;

   --  Item 6: places in metres as 1.2.91 holds them (doubles).
   type Pos is record
      X, Y : Long_Float;
      Has  : Boolean;
   end record;
   No_Pos : constant Pos := (0.0, 0.0, False);

   ---------------------------------------------------------------------
   --  Draws (counted with the walking's, for the +/-20 % check)
   ---------------------------------------------------------------------

   procedure Chance
     (S : in out Population_State; Main : in out Hood.Random.Mulberry;
      Num, Den : Unsigned_32; Result : out Boolean) is
   begin
      Hood.Random.Chance (Main, Num, Den, Result);
      S.Draws_This_Week := S.Draws_This_Week + 1;
   end Chance;

   procedure Int
     (S : in out Population_State; Main : in out Hood.Random.Mulberry;
      Min, Max : Integer_32; Value : out Integer_32) is
   begin
      Hood.Random.Int (Main, Min, Max, Value);
      S.Draws_This_Week := S.Draws_This_Week + 1;
   end Int;

   ---------------------------------------------------------------------
   --  Places and distances
   ---------------------------------------------------------------------

   function Centre (C : Hood.City.City_State; B : Integer_32) return Pos is
     ((C.Lots (C.Buildings (B).Lot).CX, C.Lots (C.Buildings (B).Lot).CY, True));

   function Block_Centre (C : Hood.City.City_State; B : Integer_32) return Pos is
     ((Long_Float (C.Blocks (B).Center_X) / 256.0, Long_Float (C.Blocks (B).Center_Y) / 256.0, True));

   function Door_Of (S : Population_State; C : Hood.City.City_State; B : Integer_32) return Pos is
      X, Y : Long_Float;
   begin
      Walk.Door (S, C, B, X, Y);
      return (X, Y, True);
   end Door_Of;

   function Point_Of (O : Order_Rec) return Pos is
     ((Long_Float (O.PX) / 256.0, Long_Float (O.PY) / 256.0, True));

   --  world.ts dist.
   function Dist (A, B : Pos) return Long_Float is
      DX : constant Long_Float := A.X - B.X;
      DY : constant Long_Float := A.Y - B.Y;
   begin
      return Sqrt (DX * DX + DY * DY);
   end Dist;

   --  routing.ts d.
   function Hyp (A, B : Pos) return Long_Float is (Hypot (A.X - B.X, A.Y - B.Y));

   function Person_Pos (S : Population_State; P : Integer_32) return Pos is
     ((S.People (P).X, S.People (P).Y, True));

   function Is_Office_Of (S : Population_State; C : Hood.City.City_State; B : Integer_32; G : Gang_Ref)
     return Boolean is
     (B /= No_Id and then G /= 0 and then Live (C, B)
      and then C.Buildings (B).Kind_Of = T_Office and then S.Extra (B).Owner_Gang = G);

   --  execution.ts nearestOffice: by lot centre.
   function Nearest_Office
     (S : Population_State; C : Hood.City.City_State; G : Gang_Ref; Near : Pos) return Integer_32
   is
      Best : Integer_32 := No_Id;
      Best_D : Long_Float := Infinity;
      D : Long_Float;
   begin
      if G = 0 then
         return No_Id;
      end if;
      for B in Integer_32 range 0 .. C.Building_Count - 1 loop
         if Is_Office_Of (S, C, B, G) then
            D := Dist (Centre (C, B), Near);
            if Best = No_Id or else D < Best_D then
               Best := B;
               Best_D := D;
            end if;
         end if;
      end loop;
      return Best;
   end Nearest_Office;

   --  transport.ts base: the nearest office door (the first on a tie).
   function Base
     (S : Population_State; C : Hood.City.City_State; G : Gang_Ref; Near : Pos) return Pos
   is
      Best : Pos := No_Pos;
      Best_D : Long_Float := Infinity;
      D : Long_Float;
      Door : Pos;
   begin
      if G /= 0 then
         for B in Integer_32 range 0 .. C.Building_Count - 1 loop
            if Is_Office_Of (S, C, B, G) then
               Door := Door_Of (S, C, B);
               D := Dist (Door, Near);
               if not Best.Has or else D < Best_D then
                  Best := Door;
                  Best_D := D;
               end if;
            end if;
         end loop;
      end if;
      return (if Best.Has then Best else Near);
   end Base;

   procedure Set_Dest
     (S : in out Population_State; C : Hood.City.City_State; P : Integer_32; To : Pos) is
   begin
      Transport.Set_Destination (S, C, P, To.X, To.Y);
   end Set_Dest;

   procedure Clear_Dest (S : in out Population_State; P : Integer_32) is
   begin
      Walk.Clear_Destination (S, P);
   end Clear_Dest;

   --  stepPerson with the minute's traffic: True on arrival, or when he
   --  has nowhere to go.
   function Step
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32) return Boolean is
     (Transport.Step_Person (S, C, I, Traffic => True));

   procedure Send_Home (S : in out Population_State; C : Hood.City.City_State; P : Integer_32) is
   begin
      if S.People (P).Status /= Active or else S.People (P).Gang = 0 then
         return;
      end if;
      S.People (P).Building := No_Id;
      declare
         Home : constant Pos := Base (S, C, S.People (P).Gang, Person_Pos (S, P));
      begin
         Transport.Send_Home (S, C, P, Home.X, Home.Y);
      end;
   end Send_Home;

   ---------------------------------------------------------------------
   --  Skills (world.ts skillAvg, starFactor; execution.ts actorSkill)
   ---------------------------------------------------------------------

   --  A star factor as Num / Den.
   type Fraction is record
      Num, Den : Integer_64;
   end record;

   function Clamp_Factor (F : Fraction) return Fraction is
     (if F.Num * 20 < F.Den then (1, 20)
      elsif F.Num > F.Den then (1, 1)
      else F);

   --  Half stars of a person over an order's skills.
   function Skill_Sum (P : Person_Rec; K : Order_Kind) return Integer_64 is
     (Integer_64 (P.Skills (Defs (K).First))
      + (if Defs (K).Two then Integer_64 (P.Skills (Defs (K).Second)) else 0));

   function Skill_Count (K : Order_Kind) return Integer_64 is (if Defs (K).Two then 2 else 1);

   --  starFactor (skillAvg (lieutenant, organization, intelligence)):
   --  stars (o + i) / 4, factor ((o + i) / 4 - 1/4) / 4.75 = (o + i - 1) / 19.
   --  starFactor (actorSkill (actors, skills)): best x 0.7 + mean x 0.3 in
   --  stars, each actor's skillAvg = half stars / (2 n).
   function Actor_Factor (S : Population_State; K : Order_Kind; Actors : Assigned_List; N : Integer_32)
     return Fraction
   is
      Best, Total, V : Integer_64 := 0;
      Sn : constant Integer_64 := Skill_Count (K);
      Kk : constant Integer_64 := Integer_64 (Integer_32'Max (1, N));
   begin
      if N = 0 then
         return Clamp_Factor ((3, 19));  --  actorSkill 1 star: (4 - 1) / 19
      end if;
      for J in 1 .. Integer (N) loop
         V := Skill_Sum (S.People (Actors (J)), K);
         Total := Total + V;
         if V > Best then
            Best := V;
         end if;
      end loop;
      --  A = (7 Best k + 3 Total) / (20 n k); factor (4A - 1) / 19.
      return Clamp_Factor ((28 * Best * Kk + 12 * Total - 20 * Sn * Kk, 380 * Sn * Kk));
   end Actor_Factor;

   --  rollChance (actors, skills, difficulty) as a chance in 10**9, then
   --  the draw (rng.chance).
   procedure Roll
     (S : in out Population_State; Main : in out Hood.Random.Mulberry; K : Order_Kind;
      Actors : Assigned_List; N : Integer_32; Diff_Num, Diff_Den : Integer_64; Result : out Boolean)
   is
      F : constant Fraction := Actor_Factor (S, K, Actors, N);
      --  0.18 + 0.85 f - 0.75 d
      P : Integer_64 :=
        (18 * F.Den * Diff_Den + 85 * F.Num * Diff_Den - 75 * Diff_Num * F.Den) * 10_000_000
          / (F.Den * Diff_Den);
   begin
      P := Integer_64'Max (30_000_000, Integer_64'Min (970_000_000, P));
      Chance (S, Main, Unsigned_32 (P), 1_000_000_000, Result);
   end Roll;

   ---------------------------------------------------------------------
   --  Crews (orderStaffing.ts, crewTime.ts)
   ---------------------------------------------------------------------

   function Lieutenant_Ok (S : Population_State; Slot : Integer_32) return Boolean is
     (Slot in S.Crews'Range and then S.Crews (Slot).Gang /= 0
      and then S.Crews (Slot).Lieutenant /= No_Id
      and then S.People (S.Crews (Slot).Lieutenant).Status = Active);

   --  crewPeople: the lieutenant, then the men, still of this crew.
   procedure Crew_People
     (S : Population_State; Slot : Integer_32; List : out Assigned_List; N : out Integer_32)
   is
      Crew : Crew_Rec renames S.Crews (Slot);
      procedure Add (P : Integer_32; Want : Role) is
      begin
         if P /= No_Id and then S.People (P).Gang = Crew.Gang and then S.People (P).Team = Crew.Id
           and then S.People (P).Kind = Want and then N < 10
         then
            N := N + 1;
            List (Integer (N)) := P;
         end if;
      end Add;
   begin
      List := [others => No_Id];
      N := 0;
      Add (Crew.Lieutenant, R_Lieutenant);
      for K in 1 .. Integer (Crew.Count) loop
         Add (Crew.Members (K), R_Hood);
      end loop;
   end Crew_People;

   function Free_For_Orders (S : Population_State; C : Hood.City.City_State; P : Integer_32) return Boolean is
     (S.People (P).Status = Active
      and then (S.People (P).Building = No_Id
                or else (S.People (P).Kind in R_Hood | R_Lieutenant
                         and then Is_Office_Of (S, C, S.People (P).Building, S.People (P).Gang))));

   function Waiting_Inside (S : Population_State; C : Hood.City.City_State; P : Integer_32) return Boolean is
     (S.People (P).Status = Active and then S.People (P).Building /= No_Id
      and then S.People (P).Kind in R_Hood | R_Lieutenant
      and then Is_Office_Of (S, C, S.People (P).Building, S.People (P).Gang));

   function Members_Count (S : Population_State; Slot : Integer_32) return Integer_32 is
      List : Assigned_List;
      N, M : Integer_32 := 0;
   begin
      Crew_People (S, Slot, List, N);
      for K in 1 .. Integer (N) loop
         if S.People (List (K)).Status /= Dead then
            M := M + 1;
         end if;
      end loop;
      return M;
   end Members_Count;

   function Crew_Men (S : Population_State; C : Hood.City.City_State; Slot : Integer_32) return Integer_32 is
      List : Assigned_List;
      N, M : Integer_32 := 0;
   begin
      Crew_People (S, Slot, List, N);
      for K in 1 .. Integer (N) loop
         if Free_For_Orders (S, C, List (K)) then
            M := M + 1;
         end if;
      end loop;
      return M;
   end Crew_Men;

   type Staffing is record
      Chosen     : Assigned_List;
      Count      : Integer_32;
      Reason     : Line_Rec;
      Impossible : Boolean;
   end record;

   function Staff
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      Kind : Order_Kind; Manpower : Integer_32; Planning : Boolean) return Staffing
   is
      Crew    : Crew_Rec renames S.Crews (Slot);
      All_Men : Assigned_List;
      N       : Integer_32;
      Members : Assigned_List := [others => No_Id];
      M       : Integer_32 := 0;
      Open    : Assigned_List := [others => No_Id];
      O_N     : Integer_32 := 0;
      Want    : constant Integer_32 := Integer_32'Max (1, Manpower);
      R       : Staffing := ([others => No_Id], 0, No_Line, False);
      Lt_Open, Willing : Boolean := False;
      Cand    : Assigned_List := [others => No_Id];
      C_N     : Integer_32 := 0;
      Key     : Integer_64;
      J       : Integer;
      V       : Integer_32;
   begin
      Crew_People (S, Slot, All_Men, N);
      for K in 1 .. Integer (N) loop
         if S.People (All_Men (K)).Status /= Dead then
            M := M + 1;
            Members (Integer (M)) := All_Men (K);
         end if;
      end loop;
      for K in 1 .. Integer (M) loop
         if Free_For_Orders (S, C, Members (K))
           and then (Planning or else S.People (Members (K)).Order = No_Id)
         then
            O_N := O_N + 1;
            Open (Integer (O_N)) := Members (K);
         end if;
      end loop;
      if M < Want then
         R.Reason := Line (F_Needs_People, Want, M);
         R.Impossible := True;
      elsif O_N < Want then
         R.Reason := Line (F_Needs_Free, Want, O_N, (if Planning then 1 else 0));
      end if;
      for K in 1 .. Integer (O_N) loop
         if Open (K) = Crew.Lieutenant then
            Lt_Open := True;
         end if;
      end loop;
      Willing := Defs (Kind).Dangerous and then Lt_Open
        and then Integer_32 (S.People (Crew.Lieutenant).Skills (Organization))
                 + Integer_32 (S.People (Crew.Lieutenant).Skills (Intelligence)) >= 12;
      --  Candidates by skill, best first; the lieutenant last among equals
      --  (a stable insertion sort, as Array.sort is stable).
      for K in 1 .. Integer (O_N) loop
         V := Open (K);
         if V /= Crew.Lieutenant or else Willing then
            Key := Skill_Sum (S.People (V), Kind);
            J := Integer (C_N);
            while J >= 1
              and then (Skill_Sum (S.People (Cand (J)), Kind) < Key
                        or else (Skill_Sum (S.People (Cand (J)), Kind) = Key
                                 and then Cand (J) = Crew.Lieutenant and then V /= Crew.Lieutenant))
            loop
               Cand (J + 1) := Cand (J);
               J := J - 1;
            end loop;
            Cand (J + 1) := V;
            C_N := C_N + 1;
         end if;
      end loop;
      for K in 1 .. Integer (C_N) loop
         exit when R.Count >= Want;
         R.Count := R.Count + 1;
         R.Chosen (Integer (R.Count)) := Cand (K);
      end loop;
      if R.Count < Want and then Lt_Open then
         declare
            Has : Boolean := False;
         begin
            for K in 1 .. Integer (R.Count) loop
               Has := Has or else R.Chosen (K) = Crew.Lieutenant;
            end loop;
            if not Has then
               R.Count := R.Count + 1;
               R.Chosen (Integer (R.Count)) := Crew.Lieutenant;
            end if;
         end;
      end if;
      return R;
   end Staff;

   function Staffing_Reason
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      Kind : Order_Kind; Manpower : Integer_32) return Line_Rec is
     (Staff (S, C, Slot, Kind, Manpower, True).Reason);

   function Men_Of (S : Population_State; C : Hood.City.City_State; Slot : Integer_32; O : Order_Rec)
     return Integer_32 is
     (Integer_32'Max (1, Integer_32'Min (Integer_32'Max (1, O.Manpower), Crew_Men (S, C, Slot))));

   function Duration (O : Order_Rec) return Integer_32 is
     (if Defs (O.Kind).Whole_Week then Minutes_Per_Week else Integer_32'Max (0, O.Estimate));

   function Man_Minutes (S : Population_State; C : Hood.City.City_State; Slot : Integer_32; O : Order_Rec)
     return Integer_32 is (Duration (O) * Men_Of (S, C, Slot, O));

   procedure Sync_Time (S : in out Population_State; C : Hood.City.City_State; Slot : Integer_32) is
      Sum : Integer_32 := 0;
   begin
      for K in 1 .. Integer (S.Crews (Slot).Order_Count) loop
         Sum := Sum + Man_Minutes (S, C, Slot, S.Orders (S.Crews (Slot).Orders (K)));
      end loop;
      S.Crews (Slot).Time_Used := Sum;
   end Sync_Time;

   type Load_List is array (1 .. 10) of Integer_32;

   --  book (): the men with the most time left take the order.
   procedure Book (Loads : in out Load_List; N : Integer_32; Men, Minutes : Integer_32;
                   Worst : out Integer_32) is
      Taken : array (1 .. 10) of Boolean := [others => False];
      Pick  : Integer;
   begin
      Worst := 0;
      for Round in 1 .. Integer (Integer_32'Min (Men, N)) loop
         Pick := 0;
         for K in 1 .. Integer (N) loop
            if not Taken (K) and then (Pick = 0 or else Loads (K) < Loads (Pick)) then
               Pick := K;
            end if;
         end loop;
         Taken (Pick) := True;
      end loop;
      for K in 1 .. Integer (N) loop
         if Taken (K) then
            Loads (K) := Loads (K) + Minutes;
            Worst := Integer_32'Max (Worst, Loads (K));
         end if;
      end loop;
   end Book;

   function Has_Time
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      O : Order_Rec; Skip : Integer_32) return Boolean
   is
      Crew    : Crew_Rec renames S.Crews (Slot);
      N       : constant Integer_32 := Crew_Men (S, C, Slot);
      Skipped : Integer_32 := 0;
      Free    : Integer_32;
      Loads   : Load_List := [others => 0];
      Worst   : Integer_32;
   begin
      for K in 1 .. Integer (Crew.Order_Count) loop
         if Crew.Orders (K) = Skip then
            Skipped := Man_Minutes (S, C, Slot, S.Orders (Skip));
         end if;
      end loop;
      Free := Minutes_Per_Week * N - Integer_32'Max (0, Crew.Time_Used - Skipped);
      if Man_Minutes (S, C, Slot, O) > Free + 48 * N then
         return False;
      end if;
      if N = 0 then
         return False;
      end if;
      for K in 1 .. Integer (Crew.Order_Count) loop
         if Crew.Orders (K) /= Skip then
            Book (Loads, N, Men_Of (S, C, Slot, S.Orders (Crew.Orders (K))),
                  Duration (S.Orders (Crew.Orders (K))), Worst);
         end if;
      end loop;
      Book (Loads, N, Men_Of (S, C, Slot, O), Duration (O), Worst);
      return Worst <= Week_Slack;
   end Has_Time;

   ---------------------------------------------------------------------
   --  Targets
   ---------------------------------------------------------------------

   function Purchasable (C : Hood.City.City_State; B : Integer_32) return Boolean is
     (Class_Of (C, B) in Empty | Commercial | Industrial | Tenement);

   function Valid_Building
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Kind : Order_Kind;
      B, Business, Front : Integer_32) return Boolean is
   begin
      if not Live (C, B) then
         return False;
      end if;
      case Kind is
         when O_Buy =>
            return S.Extra (B).Owner_Gang = 0 and then Purchasable (C, B);
         when O_Set_Up =>
            if Business not in Listed_Type or else S.Extra (B).Owner_Gang /= G
              or else Type_Class (Business) in Municipal | Empty
            then
               return False;
            end if;
            if (Type_Class (Business) = Illegal) /= (C.Lots (C.Buildings (B).Lot).Index = Centre_Lot) then
               return False;
            end if;
            if Type_Class (Business) /= Illegal then
               return True;
            end if;
            return Front /= No_Id and then Live (C, Front)
              and then S.Extra (Front).Owner_Gang = G
              and then C.Buildings (Front).Block = C.Buildings (B).Block
              and then Class_Of (C, Front) in Commercial | Industrial | Tenement | Charity
              and then (S.Extra (Front).Hides = No_Id or else S.Extra (Front).Hides = B);
         when O_Run =>
            return S.Extra (B).Owner_Gang = G and then Class_Of (C, B) /= Empty;
         when O_Guard =>
            return Class_Of (C, B) /= Empty
              and then (S.Extra (B).Owner_Gang = G or else S.Extra (B).Protect_Gang = G);
         when O_Donate =>
            return Type_Charity (C.Buildings (B).Kind_Of);
         when others =>
            return Class_Of (C, B) /= Empty;
      end case;
   end Valid_Building;

   function Valid_Area
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Kind : Order_Kind;
      B : Integer_32) return Boolean is
   begin
      if not Live (C, B) then
         return False;
      end if;
      case Kind is
         when O_Collect =>
            return S.Extra (B).Protect_Gang = G and then S.Extra (B).Collected_Week /= S.Week;
         when O_Adjust =>
            return S.Extra (B).Protect_Gang = G;
         when O_Explore =>
            return Class_Of (C, B) /= Empty;
         when O_Recruit =>
            return Type_Recruit_As (C.Buildings (B).Kind_Of) = Role'Pos (R_Hood);
         when others =>
            return True;
      end case;
   end Valid_Area;

   function Root_Block (C : Hood.City.City_State; B : Integer_32) return Integer_32 is
     (if C.Blocks (B).Merged_Into /= No_Id then C.Blocks (B).Merged_Into else B);

   --  expandTargets.
   procedure Expand
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Input : Order_Input;
      Out_List : out Target_List; Count : out Integer_32)
   is
      function Seen (B : Integer_32) return Boolean is
      begin
         for K in 1 .. Integer (Count) loop
            if Out_List (K) = B then
               return True;
            end if;
         end loop;
         return False;
      end Seen;
      Blk, B : Integer_32;
   begin
      Out_List := [others => No_Id];
      Count := 0;
      case Defs (Input.Kind).Target is
         when On_Building =>
            if Input.Picked_Count > 0 then
               Count := 1;
               Out_List (1) := Input.Picked (1);
            end if;
         when On_Point =>
            null;
         when On_Area =>
            for K in 1 .. Integer (Input.Picked_Count) loop
               if Count < Max_Targets and then not Seen (Input.Picked (K)) then
                  Count := Count + 1;
                  Out_List (Integer (Count)) := Input.Picked (K);
               end if;
            end loop;
            for K in 1 .. Integer (Input.Block_Count) loop
               Blk := Input.Blocks (K);
               for L in C.Blocks (Blk).First_Lot .. C.Blocks (Blk).First_Lot + C.Blocks (Blk).Lots - 1 loop
                  B := C.Lots (L).Building;
                  if B /= No_Id and then Count < Max_Targets and then not Seen (B)
                    and then Valid_Area (S, C, G, Input.Kind, B)
                  then
                     Count := Count + 1;
                     Out_List (Integer (Count)) := B;
                  end if;
               end loop;
            end loop;
      end case;
   end Expand;

   function First_Pos (C : Hood.City.City_State; O : Order_Rec) return Pos is
     (if O.Target_Count > 0 then Centre (C, O.Targets (1))
      elsif O.Has_Point then Point_Of (O)
      elsif O.Block_Count > 0 then Block_Centre (C, O.Blocks (1))
      else No_Pos);

   function End_Pos (C : Hood.City.City_State; O : Order_Rec) return Pos is
     (if Defs (O.Kind).Target = On_Point then First_Pos (C, O)
      elsif O.Target_Count > 0 then Centre (C, O.Targets (Integer (O.Target_Count)))
      else First_Pos (C, O));

   --  crewStartFor.
   function Start_For
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      First : Pos; Self : Integer_32) return Pos
   is
      Crew : Crew_Rec renames S.Crews (Slot);
      At_K : Integer := 0;
      Before : Crew_Order_List := [others => No_Id];
      B_N  : Integer := 0;
      Standing : Integer_32 := 0;
      Men  : Integer_32;
      E    : Pos;
      Office : Integer_32;
      Near : Pos := First;
   begin
      for K in 1 .. Integer (Crew.Order_Count) loop
         if Crew.Orders (K) = Self then
            At_K := K;
         end if;
      end loop;
      for K in 1 .. Integer (Crew.Order_Count) loop
         declare
            O : Order_Rec renames S.Orders (Crew.Orders (K));
         begin
            if O.State /= Cancelled then
               if Defs (O.Kind).Whole_Week then
                  Standing := Standing + Integer_32'Max (1, O.Manpower);
               elsif (if At_K > 0 then K < At_K else Crew.Orders (K) /= Self) then
                  B_N := B_N + 1;
                  Before (B_N) := Crew.Orders (K);
               end if;
            end if;
         end;
      end loop;
      Men := Integer_32'Max (1, 1 + Crew.Count - Standing);
      if Integer_32 (B_N) >= Men then
         E := End_Pos (C, S.Orders (Before (B_N - Integer (Men) + 1)));
         if E.Has then
            return E;
         end if;
      end if;
      if not Near.Has then
         Near := (if Crew.Lieutenant /= No_Id then Person_Pos (S, Crew.Lieutenant)
                  else Block_Centre (C, 0));
      end if;
      Office := Nearest_Office (S, C, Crew.Gang, Near);
      return (if Office /= No_Id then Centre (C, Office) else No_Pos);
   end Start_For;

   procedure Planned_Travel
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      O : Order_Rec; From, To : Pos; Speed, Walk_Minutes : out Long_Float)
   is
      St : constant Staffing := Staff (S, C, Slot, O.Kind, O.Manpower, S.Phase = Planning);
      People : Transport.People_List := [others => No_Id];
   begin
      for K in 1 .. Integer (St.Count) loop
         People (K) := St.Chosen (K);
      end loop;
      Transport.Planned_Travel
        (S, C, Slot, People, St.Count, From.Has, From.X, From.Y, To.Has, To.X, To.Y,
         Speed, Walk_Minutes);
   end Planned_Travel;

   --  execution.ts estimateMinutes, in doubles as 1.2.91 adds it up: the
   --  work, then the march from the start through the targets at the
   --  crew's planned pace (plannedTravel), plus the walk to the car.
   function Estimate
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      O : Order_Rec; Self : Integer_32) return Integer_32
   is
      Crew : Crew_Rec renames S.Crews (Slot);
      D    : Def_Rec renames Defs (O.Kind);
      Bodies, Mp : Integer_32;
      Efficiency, Work, Travel : Long_Float := 0.0;
      Speed, Walk_Minutes : Long_Float;
      Targets : Integer_32;
      Start, Cur : Pos;
      Last : Integer_32;
   begin
      if D.Whole_Week then
         Bodies := Integer_32'Max (1, Crew_Men (S, C, Slot));
         Mp := Integer_32'Max (1, O.Manpower);
         return Round_Int (Long_Float (Minutes_Per_Week * Mp) / Long_Float (Bodies));
      end if;
      Mp := Integer_32'Max (1, O.Manpower);
      Start := Start_For (S, C, Slot, First_Pos (C, O), Self);
      Planned_Travel (S, C, Slot, O, Start, First_Pos (C, O), Speed, Walk_Minutes);
      if Crew.Lieutenant /= No_Id then
         declare
            P : Person_Rec renames S.People (Crew.Lieutenant);
            T : Long_Float := 0.0;
         begin
            T := T + Long_Float (P.Skills (Organization)) / 2.0;
            T := T + Long_Float (P.Skills (Intelligence)) / 2.0;
            Efficiency := 1.35 - Max (0.05, Min (1.0, (T / 2.0 - 0.25) / 4.75)) * 0.4;
         end;
      else
         Efficiency := 1.2;
      end if;
      Targets := (if D.Target = On_Area then Integer_32'Max (1, O.Target_Count) else 1);
      Work := Long_Float (D.Minutes) * Long_Float (Targets) * Efficiency;
      Cur := Start;
      Last := (if D.Target = On_Area then O.Target_Count else Integer_32'Min (1, O.Target_Count));
      for K in 1 .. Integer (Last) loop
         if Cur.Has then
            Travel := Travel + Dist (Cur, Centre (C, O.Targets (K)));
         end if;
         Cur := Centre (C, O.Targets (K));
      end loop;
      if D.Target = On_Point and then O.Has_Point and then Cur.Has then
         Travel := Travel + Dist (Cur, Point_Of (O));
      end if;
      return Round_Int (Work / Long_Float (Mp) + Travel / Speed + Walk_Minutes + 0.0);
   end Estimate;

   ---------------------------------------------------------------------
   --  Money
   ---------------------------------------------------------------------

   function Building_Value (S : Population_State; C : Hood.City.City_State; B : Integer_32) return Integer_32 is
      pragma Unreferenced (S);
      LV : constant Integer_32 := C.Blocks (C.Buildings (B).Block).Land_Value;
   begin
      if Class_Of (C, B) = Empty then
         --  40 x (band + 1), band = min (15, floor (lv x 2.55) >> 4)
         return 40 * (Integer_32'Min (15, (LV * 255 / 100) / 16) + 1);
      end if;
      --  round (cost x (0.55 + lv / 100)); no crime heat before item 7
      return (Type_Cost (C.Buildings (B).Kind_Of) * (55 + LV) + 50) / 100;
   end Building_Value;

   function Donation_Amount (C : Hood.City.City_State; B : Integer_32) return Integer_32 is
      Squalor : constant Integer_32 :=
        Integer_32'Max (0, Integer_32'Min (100, C.Blocks (C.Buildings (B).Block).Squalor));
   begin
      return 400 + (100 - Squalor) * 22;
   end Donation_Amount;

   function Order_Cost (S : Population_State; C : Hood.City.City_State; O : Order_Rec) return Integer_32 is
   begin
      case O.Kind is
         when O_Buy =>
            return (if O.Target_Count > 0 then Building_Value (S, C, O.Targets (1)) else 0);
         when O_Set_Up =>
            return (if O.Business in Listed_Type then Type_Cost (O.Business) else 0);
         when O_Donate =>
            return Integer_32'Max (0, O.Amount);
         when O_Clean_Up =>
            return O.Target_Count * Cleanup_Cost;
         when others =>
            return 0;
      end case;
   end Order_Cost;

   function Committed_Cash
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Except : Integer_32) return Integer_32
   is
      Sum : Integer_32 := 0;
   begin
      for K in S.Orders'Range loop
         if S.Orders (K).Gang = G and then K /= Except
           and then S.Orders (K).State not in Done | Failed | Cancelled
         then
            Sum := Sum + Order_Cost (S, C, S.Orders (K));
         end if;
      end loop;
      return Sum;
   end Committed_Cash;

   function Spend (S : in out Population_State; G : Gang_Id; Amount : Integer_32) return Boolean is
   begin
      if S.Gangs (G).Cash < Amount then
         return False;
      end if;
      S.Gangs (G).Cash := S.Gangs (G).Cash - Amount;
      S.Gangs (G).Purchases := S.Gangs (G).Purchases + Amount;
      return True;
   end Spend;

   ---------------------------------------------------------------------
   --  Collect routes (collectRoutes.ts; routing.ts planRoute)
   ---------------------------------------------------------------------

   --  crewStart: from the stop nearest one of the gang's offices.
   function Route_Start
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      Ids : Target_List; N : Integer_32; Skip : Integer_32) return Pos
   is
      G     : constant Gang_Ref := S.Crews (Slot).Gang;
      First : Pos := No_Pos;
      Best, D : Long_Float := Infinity;
      Office : Integer_32;
      P     : Pos;
   begin
      for K in 1 .. Integer (N) loop
         P := Centre (C, Ids (K));
         Office := Nearest_Office (S, C, G, P);
         D := (if Office /= No_Id then Dist (Centre (C, Office), P) else 0.0);
         if D < Best then
            Best := D;
            First := P;
         end if;
      end loop;
      P := Start_For (S, C, Slot, First, Skip);
      if not P.Has and then S.Crews (Slot).Lieutenant /= No_Id then
         P := Person_Pos (S, S.Crews (Slot).Lieutenant);
      end if;
      return P;
   end Route_Start;

   --  Nearest stop next, then crossings removed (up to 8 passes).
   procedure Plan_Route (Start : Pos; C : Hood.City.City_State; Ids : in out Target_List; N : Integer_32) is
      Route : Target_List := [others => No_Id];
      Left  : Target_List := Ids;
      L_N   : Integer := Integer (N);
      At_P  : Pos := Start;
      Best  : Integer;
      Improved : Boolean := True;
      Pass  : Integer := 0;
      function P_Of (K : Integer) return Pos is (Centre (C, Route (K)));
      A, B, Cc, E : Pos;
      Before, After : Long_Float;
      Tmp : Target_List;
   begin
      for R in 1 .. Integer (N) loop
         Best := 1;
         for K in 2 .. L_N loop
            if Hyp (At_P, Centre (C, Left (K))) < Hyp (At_P, Centre (C, Left (Best))) then
               Best := K;
            end if;
         end loop;
         Route (R) := Left (Best);
         At_P := Centre (C, Left (Best));
         for K in Best .. L_N - 1 loop
            Left (K) := Left (K + 1);
         end loop;
         L_N := L_N - 1;
      end loop;
      while Improved and then Pass < 8 loop
         Improved := False;
         for I in 1 .. Integer (N) - 1 loop
            for J in I + 1 .. Integer (N) loop
               A := (if I = 1 then Start else P_Of (I - 1));
               B := P_Of (I);
               Cc := P_Of (J);
               E := (if J < Integer (N) then P_Of (J + 1) else No_Pos);
               Before := Hyp (A, B) + (if E.Has then Hyp (Cc, E) else 0.0);
               After := Hyp (A, Cc) + (if E.Has then Hyp (B, E) else 0.0);
               if After < Before - 1.0E-6 then
                  Tmp := Route;
                  for K in I .. J loop
                     Route (K) := Tmp (J - (K - I));
                  end loop;
                  Improved := True;
               end if;
            end loop;
         end loop;
         Pass := Pass + 1;
      end loop;
      Ids := Route;
   end Plan_Route;

   procedure Route_Order
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      Ids : in out Target_List; N : Integer_32; Skip : Integer_32)
   is
      Start : Pos;
   begin
      if N < 2 then
         return;
      end if;
      Start := Route_Start (S, C, Slot, Ids, N, Skip);
      if Start.Has then
         Plan_Route (Start, C, Ids, N);
      end if;
   end Route_Order;

   function In_Queued_Collect
     (S : Population_State; G : Gang_Id; B : Integer_32; Skip : Integer_32) return Boolean is
   begin
      for Slot in S.Crews'Range loop
         if S.Crews (Slot).Gang = G then
            for K in 1 .. Integer (S.Crews (Slot).Order_Count) loop
               declare
                  Id : constant Integer_32 := S.Crews (Slot).Orders (K);
                  O  : Order_Rec renames S.Orders (Id);
               begin
                  if Id /= Skip and then O.Kind = O_Collect and then O.State /= Done then
                     for T in 1 .. Integer (O.Target_Count) loop
                        if O.Targets (T) = B then
                           return True;
                        end if;
                     end loop;
                  end if;
               end;
            end loop;
         end if;
      end loop;
      return False;
   end In_Queued_Collect;

   procedure Trim_To_Week
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      O : Order_Rec; Kept : out Target_List; Kept_Count : out Integer_32)
   is
      Skip  : constant Integer_32 := No_Id;
      Start : constant Pos := Route_Start (S, C, Slot, O.Targets, O.Target_Count, Skip);
      Ids   : Target_List := O.Targets;
      N     : Integer_32 := O.Target_Count;
      Worst : Integer;
      Saving, Sv : Long_Float;
      Prev, Here, Next : Pos;

      function Fits return Boolean is
         Part : Order_Rec := O;
      begin
         Part.Targets := Ids;
         Part.Target_Count := N;
         Part.Block_Count := 0;
         Part.Estimate := Estimate (S, C, Slot, Part, No_Id);
         return Has_Time (S, C, Slot, Part, Skip);
      end Fits;
   begin
      while N > 1 loop
         Worst := Integer (N);
         Saving := -Infinity;
         for I in 1 .. Integer (N) loop
            Prev := (if I = 1 then Start else Centre (C, Ids (I - 1)));
            Here := Centre (C, Ids (I));
            Next := (if I < Integer (N) then Centre (C, Ids (I + 1)) else No_Pos);
            Sv := (if Prev.Has then Dist (Prev, Here) else 0.0)
              + (if Next.Has
                 then Dist (Here, Next) - (if Prev.Has then Dist (Prev, Next) else 0.0)
                 else 0.0);
            if Sv > Saving then
               Saving := Sv;
               Worst := I;
            end if;
         end loop;
         for K in Worst .. Integer (N) - 1 loop
            Ids (K) := Ids (K + 1);
         end loop;
         Ids (Integer (N)) := No_Id;
         N := N - 1;
         if O.Kind = O_Collect then
            Route_Order (S, C, Slot, Ids, N, Skip);
         end if;
         if Fits then
            Kept := Ids;
            Kept_Count := N;
            return;
         end if;
      end loop;
      if N = 1 and then Fits then
         Kept := Ids;
         Kept_Count := 1;
      else
         Kept := [others => No_Id];
         Kept_Count := 0;
      end if;
   end Trim_To_Week;

   ---------------------------------------------------------------------
   --  Drafts (api.ts previewOrder)
   ---------------------------------------------------------------------

   procedure Draft
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id;
      Input : Order_Input; Editing : Integer_32; O : out Order_Rec)
   is
      In2  : Order_Input := Input;
      Ids  : Target_List;
      N, M : Integer_32;
      Kept : Target_List := [others => No_Id];
      Root : Integer_32;
      Dup  : Boolean;
   begin
      --  Blocks: their merged sites, once each.
      In2.Block_Count := 0;
      In2.Blocks := [others => No_Id];
      for K in 1 .. Integer (Input.Block_Count) loop
         Root := Root_Block (C, Input.Blocks (K));
         Dup := False;
         for J in 1 .. Integer (In2.Block_Count) loop
            Dup := Dup or else In2.Blocks (J) = Root;
         end loop;
         if not Dup then
            In2.Block_Count := In2.Block_Count + 1;
            In2.Blocks (Integer (In2.Block_Count)) := Root;
         end if;
      end loop;
      Expand (S, C, G, In2, Ids, N);
      if Input.Kind = O_Collect then
         M := 0;
         for K in 1 .. Integer (N) loop
            if Live (C, Ids (K)) and then not In_Queued_Collect (S, G, Ids (K), Editing)
              and then S.Extra (Ids (K)).Collected_Week /= S.Week
            then
               M := M + 1;
               Kept (Integer (M)) := Ids (K);
            end if;
         end loop;
         Ids := Kept;
         N := M;
         Route_Order (S, C, Input.Crew, Ids, N, Editing);
      end if;
      O := (Id => No_Id, Gang => G, Crew => Input.Crew, Kind => Input.Kind, State => Queued,
            Manpower => Input.Manpower, Repeat => Input.Repeat, Amount => Input.Amount,
            Level => Input.Level, Business => Input.Business, Front => Input.Front,
            PX => Input.PX, PY => Input.PY, Has_Point => Input.Has_Point,
            Target_Count => N, Targets => Ids, Block_Count => In2.Block_Count, Blocks => In2.Blocks,
            Assigned_Count => 0, Assigned => [others => No_Id], Cursor => 0, Completed => 0,
            Work_Left => 0, Estimate => 0, Worked => -1, Started => -1, Finished => -1,
            Crew_Size => -1, Fail | Last_Miss | Waiting_For => No_Line,
            Result_Count => 0, Results => [others => No_Line],
            No_Car_Count => 0, No_Car => [others => No_Id]);
      if Input.Kind = O_Donate and then Input.Amount < 0 and then N > 0
        and then Type_Charity (C.Buildings (Ids (1)).Kind_Of)
      then
         O.Amount := Donation_Amount (C, Ids (1));
      end if;
      O.Estimate := Estimate (S, C, Input.Crew, O, No_Id);
   end Draft;

   procedure Retime (S : in out Population_State; C : Hood.City.City_State; Slot : Integer_32) is
   begin
      if S.Phase = Planning then
         for K in 1 .. Integer (S.Crews (Slot).Order_Count) loop
            declare
               Id : constant Integer_32 := S.Crews (Slot).Orders (K);
            begin
               if S.Orders (Id).State = Queued then
                  S.Orders (Id).Estimate := Estimate (S, C, Slot, S.Orders (Id), Id);
               end if;
            end;
         end loop;
      end if;
      Sync_Time (S, C, Slot);
   end Retime;

   ---------------------------------------------------------------------
   --  Reports and results
   ---------------------------------------------------------------------

   procedure Report (S : in out Population_State; G : Gang_Ref; Line : Line_Rec) is
   begin
      if G = 0 or else not S.Gangs (G).Player or else S.Message_Count >= Max_Messages then
         return;
      end if;
      S.Message_Count := S.Message_Count + 1;
      S.Messages (Integer (S.Message_Count)) := Line;
   end Report;

   procedure Say (O : in out Order_Rec; L : Line_Rec) is
   begin
      if O.Result_Count < Max_Results then
         O.Result_Count := O.Result_Count + 1;
         O.Results (Integer (O.Result_Count)) := L;
      end if;
   end Say;

   --  A fail line inside a message: A order kind, B its kind, C .. D its first numbers.
   function Wrap (Kind : Line_Kind; K : Order_Kind; L : Line_Rec) return Line_Rec is
     (Line (Kind, Order_Kind'Pos (K), Line_Kind'Pos (L.Kind), L.A, L.B));

   --  finishOrder.
   procedure Finish
     (S : in out Population_State; C : Hood.City.City_State; Id : Integer_32; Fail : Line_Rec)
   is
      O      : Order_Rec renames S.Orders (Id);
      Is_Failed : constant Boolean := Fail.Kind /= L_None;
      Partly : constant Boolean := Is_Failed and then O.Completed > 0;
      P      : Integer_32;
   begin
      Transport.Release_Order (S, Id);
      O.State := (if Is_Failed and then not Partly then Failed else Done);
      O.Fail := Fail;
      O.Finished := S.Minute;
      O.Waiting_For := No_Line;
      if Is_Failed then
         Report (S, O.Gang, Wrap ((if Partly then M_Order_Cut_Short else M_Order_Failed), O.Kind, Fail));
      end if;
      for K in 1 .. Integer (O.Assigned_Count) loop
         P := O.Assigned (K);
         if P /= No_Id and then S.People (P).Order = Id then
            S.People (P).Order := No_Id;
            if S.People (P).Status = Active and then S.People (P).Building = No_Id then
               Send_Home (S, C, P);
            end if;
         end if;
      end loop;
      O.Assigned_Count := 0;
      O.Assigned := [others => No_Id];
   end Finish;

   ---------------------------------------------------------------------
   --  Hand-out (assignOrder, beginWeekOrders)
   ---------------------------------------------------------------------

   function Standing_Block_Count (C : Hood.City.City_State; O : Order_Rec; Nth : Integer_32;
                                  Block : out Integer_32) return Integer_32
   is
      List : Block_List := [others => No_Id];
      N    : Integer_32 := 0;
      procedure Add (B : Integer_32) is
         R : constant Integer_32 := Root_Block (C, B);
      begin
         for K in 1 .. Integer (N) loop
            if List (K) = R then
               return;
            end if;
         end loop;
         if N < Max_Order_Blocks then
            N := N + 1;
            List (Integer (N)) := R;
         end if;
      end Add;
   begin
      for K in 1 .. Integer (O.Block_Count) loop
         Add (O.Blocks (K));
      end loop;
      for K in 1 .. Integer (O.Target_Count) loop
         Add (C.Buildings (O.Targets (K)).Block);
      end loop;
      Block := (if N > 0 then List (Integer (Nth mod N) + 1) else No_Id);
      return N;
   end Standing_Block_Count;

   --  targetPos: where the men must stand for the current target.
   function Target_Pos (S : Population_State; C : Hood.City.City_State; O : Order_Rec) return Pos is
      Blk : Integer_32;
      N   : Integer_32;
      X, Y : Long_Float;
   begin
      case Defs (O.Kind).Target is
         when On_Point =>
            return (if O.Has_Point then Point_Of (O) else No_Pos);
         when On_Area =>
            if Defs (O.Kind).Whole_Week then
               N := Standing_Block_Count (C, O, O.Cursor, Blk);
               if N = 0 then
                  return No_Pos;
               end if;
               Pavement (C.Blocks (Blk), O.Id + O.Cursor, X, Y);
               return (X, Y, True);
            end if;
         when On_Building =>
            null;
      end case;
      if O.Cursor >= O.Target_Count or else not Live (C, O.Targets (Integer (O.Cursor) + 1)) then
         return No_Pos;
      end if;
      return Door_Of (S, C, O.Targets (Integer (O.Cursor) + 1));
   end Target_Pos;

   --  transport.ts allocateTransport: the men going further than a drive
   --  take the crew's free cars where that is quicker; the rest walk.
   procedure Allocate
     (S : in out Population_State; C : Hood.City.City_State; Slot, Id : Integer_32;
      Chosen : Assigned_List; N : Integer_32; To : Pos)
   is
      Drivers : Transport.People_List := [others => No_Id];
      ND : Integer_32 := 0;
      P : Transport.Plan;
      In_Car : array (1 .. 10) of Boolean := [others => False];
   begin
      Transport.Reconcile (S, C);
      for K in 1 .. Integer (N) loop
         if Dist (Person_Pos (S, Chosen (K)), To) > Transport.Drive_Min_Distance
           and then not Transport.No_Car (S, Id, Chosen (K))
         then
            ND := ND + 1;
            Drivers (Integer (ND)) := Chosen (K);
         end if;
      end loop;
      Transport.Crew_Plan (S, C, Slot, Drivers, ND, False, 0.0, 0.0, True, To.X, To.Y, P);
      for K in 1 .. Integer (P.Car_Count) loop
         Transport.Reserve_Crew_Car (S, C, Slot, Id, P.Cars (K), To.X, To.Y);
         for R in 1 .. Integer (P.Cars (K).Count) loop
            for J in 1 .. Integer (N) loop
               if Chosen (J) = P.Cars (K).Riders (R) then
                  In_Car (J) := True;
               end if;
            end loop;
         end loop;
      end loop;
      --  plan.walkers, then the men not going far enough to drive.
      for K in 1 .. Integer (P.Walker_Count) loop
         S.People (P.Walkers (K)).In_Vehicle := False;
         S.People (P.Walkers (K)).Vehicle := No_Id;
         Set_Dest (S, C, P.Walkers (K), To);
      end loop;
      for J in 1 .. Integer (N) loop
         declare
            Driver : Boolean := False;
         begin
            for K in 1 .. Integer (ND) loop
               Driver := Driver or else Drivers (K) = Chosen (J);
            end loop;
            if not Driver and then not In_Car (J) then
               S.People (Chosen (J)).In_Vehicle := False;
               S.People (Chosen (J)).Vehicle := No_Id;
               Set_Dest (S, C, Chosen (J), To);
            end if;
         end;
      end loop;
   end Allocate;

   function Assign
     (S : in out Population_State; C : Hood.City.City_State; Slot, Id : Integer_32;
      At_Week_Start : Boolean) return Boolean
   is
      O    : Order_Rec renames S.Orders (Id);
      St   : constant Staffing := Staff (S, C, Slot, O.Kind, O.Manpower, False);
      Tp   : Pos;
      Office, P : Integer_32;
   begin
      if St.Reason.Kind /= L_None then
         if St.Impossible then
            Finish (S, C, Id, St.Reason);
            return False;
         end if;
         if O.Waiting_For.Kind = L_None then
            Report (S, O.Gang, Wrap (M_Queued_Waiting, O.Kind, St.Reason));
         end if;
         O.Waiting_For := St.Reason;
         return False;
      end if;
      --  A man riding home in a crew car gets out where he is and goes.
      for K in 1 .. Integer (St.Count) loop
         if S.People (St.Chosen (K)).Vehicle /= No_Id then
            Transport.Alight (S, C, St.Chosen (K));
         end if;
      end loop;
      for K in 1 .. Integer (St.Count) loop
         P := St.Chosen (K);
         if Waiting_Inside (S, C, P) then
            declare
               Door : constant Pos := Door_Of (S, C, S.People (P).Building);
            begin
               S.People (P).Building := No_Id;
               S.People (P).X := Door.X;
               S.People (P).Y := Door.Y;
            end;
         end if;
      end loop;
      O.Assigned := St.Chosen;
      O.Assigned_Count := St.Count;
      if O.Started < 0 then
         O.Started := S.Minute;
      end if;
      O.Waiting_For := No_Line;
      O.Crew_Size := St.Count;
      O.Worked := 0;
      for K in 1 .. Integer (St.Count) loop
         S.People (St.Chosen (K)).Order := Id;
      end loop;
      O.State := Travelling;
      O.Cursor := 0;
      O.Completed := 0;
      O.Result_Count := 0;
      O.Results := [others => No_Line];
      O.Fail := No_Line;
      Tp := Target_Pos (S, C, O);
      if At_Week_Start and then Tp.Has then
         Office := Nearest_Office (S, C, O.Gang, Tp);
         if Office /= No_Id then
            for K in 1 .. Integer (St.Count) loop
               P := St.Chosen (K);
               S.People (P).X := Door_Of (S, C, Office).X;
               S.People (P).Y := Door_Of (S, C, Office).Y;
            end loop;
         end if;
      end if;
      if Tp.Has then
         Allocate (S, C, Slot, Id, St.Chosen, St.Count, Tp);
      end if;
      return True;
   end Assign;

   --  Crew slots in crew-number order (Object.values over 1.2.91's teams).
   procedure Crews_By_Number (S : Population_State; List : out Crew_Slots_All; N : out Integer_32) is
      J : Integer;
      V : Integer_32;
   begin
      List := [others => No_Id];
      N := 0;
      for Slot in S.Crews'Range loop
         if S.Crews (Slot).Gang /= 0 then
            V := Slot;
            J := Integer (N);
            while J >= 1 and then S.Crews (List (J)).Id > S.Crews (V).Id loop
               List (J + 1) := List (J);
               J := J - 1;
            end loop;
            List (J + 1) := V;
            N := N + 1;
         end if;
      end loop;
   end Crews_By_Number;

   procedure Begin_Week (S : in out Population_State; C : Hood.City.City_State) is
      List : Crew_Slots_All;
      N    : Integer_32;
      Ok   : Boolean;
      pragma Unreferenced (Ok);
   begin
      Transport.Reset_Week (S, C);
      for P in Integer_32 range 0 .. S.Count - 1 loop
         if S.People (P).Gang /= 0 and then S.People (P).Kind in R_Hood | R_Lieutenant
           and then S.People (P).Building = No_Id and then S.People (P).Vehicle = No_Id
         then
            Clear_Dest (S, P);
            S.People (P).In_Vehicle := False;
         end if;
      end loop;
      Crews_By_Number (S, List, N);
      for K in 1 .. Integer (N) loop
         for J in 1 .. Integer (S.Crews (List (K)).Order_Count) loop
            declare
               O : Order_Rec renames S.Orders (S.Crews (List (K)).Orders (J));
            begin
               if O.State /= Cancelled then
                  O.State := Queued;
                  O.Assigned_Count := 0;
                  O.Assigned := [others => No_Id];
               end if;
            end;
         end loop;
      end loop;
      for P in Integer_32 range 0 .. S.Count - 1 loop
         S.People (P).Order := No_Id;
      end loop;
      for K in 1 .. Integer (N) loop
         for J in 1 .. Integer (S.Crews (List (K)).Order_Count) loop
            if S.Orders (S.Crews (List (K)).Orders (J)).State = Queued then
               Ok := Assign (S, C, List (K), S.Crews (List (K)).Orders (J), True);
            end if;
         end loop;
      end loop;
   end Begin_Week;

   ---------------------------------------------------------------------
   --  Resolution (resolveTarget, the peaceful orders)
   ---------------------------------------------------------------------

   procedure Assign_Manager
     (S : in out Population_State; Slot : Integer_32; C : Hood.City.City_State; B : Integer_32;
      Actors : Assigned_List; N : Integer_32)
   is
      Best : Integer_32 := No_Id;
      V    : Integer_32;
      function Score (P : Integer_32) return Integer_32 is
        (Integer_32 (S.People (P).Skills (Business)) + Integer_32 (S.People (P).Skills (Organization)));
   begin
      for K in 1 .. Integer (N) loop
         V := Actors (K);
         if S.People (V).Status = Active and then S.People (V).Building = No_Id
           and then V /= S.Crews (Slot).Lieutenant
           and then (Best = No_Id or else Score (V) > Score (Best))
         then
            Best := V;
         end if;
      end loop;
      if Best = No_Id then
         return;
      end if;
      Remove_Member (S, Slot, Best);
      S.People (Best).Team := No_Id;
      S.People (Best).Order := No_Id;
      S.People (Best).Building := B;
      Transport.Dismount (S, Best);
      S.People (Best).X := Centre (C, B).X;
      S.People (Best).Y := Centre (C, B).Y;
      Clear_Dest (S, Best);
      S.Extra (B).Manager := Best;
   end Assign_Manager;

   function Has_Manager_Candidate
     (S : Population_State; Slot : Integer_32; Actors : Assigned_List; N : Integer_32) return Boolean is
   begin
      for K in 1 .. Integer (N) loop
         if S.People (Actors (K)).Status = Active and then S.People (Actors (K)).Building = No_Id
           and then Actors (K) /= S.Crews (Slot).Lieutenant
         then
            return True;
         end if;
      end loop;
      return False;
   end Has_Manager_Candidate;

   --  receiveOrderCash with the Standard skim (the collector's greed).
   function Declared
     (S : Population_State; Slot : Integer_32; O : Order_Rec; G : Gang_Id; Gross : Integer_32) return Integer_32
   is
      Lt  : constant Integer_32 := S.Crews (Slot).Lieutenant;
      Col : Integer_32 := No_Id;
      Margin, Rate : Integer_32;
   begin
      if Lt /= No_Id and then S.People (Lt).Gang = G and then S.People (Lt).Status /= Dead then
         Col := Lt;
      else
         for K in 1 .. Integer (O.Assigned_Count) loop
            if Col = No_Id and then S.People (O.Assigned (K)).Status = Active then
               Col := O.Assigned (K);
            end if;
         end loop;
      end if;
      if Col = No_Id or else Gross <= 0 then
         return Gross;
      end if;
      Margin := Hostility_Of (S.People (Col), G) - Fear_Of (S.People (Col), G);
      if Margin <= 64 or else S.People (Col).Pay >= S.People (Col).Demand then
         return Gross;
      end if;
      Rate := ((Margin + 256) / 2) mod 256;  --  in 256ths
      --  round (gross x (1 - rate / 256))
      return Integer_32 ((Integer_64 (Gross) * Integer_64 (256 - Rate) * 2 + 256) / 512);
   end Declared;

   procedure Take_On_Hood
     (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id; Slot, P : Integer_32;
      To_Pool : Boolean; Crew_Joined : out Boolean)
   is
      Office : Integer_32;
   begin
      S.People (P).Gang := G;
      S.People (P).Building := No_Id;
      S.People (P).Team := No_Id;
      S.People (P).Loyalty := Loyalty_Start;
      S.People (P).Demand :=
        (if C.Standard then Wage_Quote (S.People (P), G) else Pay_Demand (S.People (P), R_Hood));
      S.People (P).Pay := S.People (P).Demand;
      S.People (P).Order := No_Id;
      Office := Nearest_Office (S, C, G, Person_Pos (S, P));
      if Office /= No_Id then
         S.People (P).X := Centre (C, Office).X;
         S.People (P).Y := Centre (C, Office).Y;
      end if;
      if not To_Pool and then S.Crews (Slot).Count < Max_Crew_Members then
         Add_Member (S, Slot, P);
         Crew_Joined := True;
      else
         Join_Pool (S, G, P);
         Crew_Joined := False;
      end if;
   end Take_On_Hood;

   --  Returns the miss (L_None when the target counts as done).
   procedure Resolve
     (S : in out Population_State; C : in out Hood.City.City_State; Main : in out Hood.Random.Mulberry;
      Slot, Id : Integer_32; Actors : Assigned_List; N : Integer_32; Missed : out Line_Rec)
   is
      O  : Order_Rec renames S.Orders (Id);
      G  : constant Gang_Id := O.Gang;
      B  : constant Integer_32 :=
        (if O.Cursor < O.Target_Count then O.Targets (Integer (O.Cursor) + 1) else No_Id);
      Has_B : constant Boolean := B /= No_Id and then Live (C, B);
      Cost, Amount : Integer_32;
      Found : Boolean;

      procedure Miss (L : Line_Rec) is
      begin
         Say (O, L);
         Missed := L;
      end Miss;
   begin
      Missed := No_Line;
      case O.Kind is
         when O_Buy =>
            if not Has_B then
               Finish (S, C, Id, Line (F_No_Site));
            elsif S.Extra (B).Owner_Gang /= 0 then
               Finish (S, C, Id, Line (F_Owned_Already));
            elsif not Purchasable (C, B) then
               Finish (S, C, Id, Line (F_Not_For_Sale));
            else
               Cost := Building_Value (S, C, B);
               if not Spend (S, G, Cost) then
                  Finish (S, C, Id, Line (F_Price));
               else
                  S.Extra (B).Owner_Gang := G;
                  S.Extra (B).Protect_Gang := 0;
                  S.Extra (B).Protect_Weekly := 0;
                  if Class_Of (C, B) /= Empty then
                     Assign_Manager (S, Slot, C, B, Actors, N);
                  end if;
                  Say (O, Line (L_Bought, B, Cost));
                  Report (S, G, Line (M_Acquired, B));
               end if;
            end if;

         when O_Set_Up =>
            if not Has_B then
               Finish (S, C, Id, Line (F_No_Site));
            elsif S.Extra (B).Owner_Gang /= G then
               Finish (S, C, Id, Line (F_Not_Yours));
            elsif O.Business not in Listed_Type then
               Finish (S, C, Id, Line (F_No_Type));
            elsif Type_Class (O.Business) = Illegal and then C.Lots (C.Buildings (B).Lot).Index /= Centre_Lot then
               Finish (S, C, Id, Line (F_Illegal_Centre));
            elsif Type_Class (O.Business) /= Illegal and then C.Lots (C.Buildings (B).Lot).Index = Centre_Lot then
               Finish (S, C, Id, Line (F_Legal_Centre));
            elsif Type_Class (O.Business) = Municipal then
               Finish (S, C, Id, Line (F_City_Only));
            elsif Type_Class (O.Business) = Illegal
              and then (O.Front = No_Id or else not Live (C, O.Front)
                        or else S.Extra (O.Front).Owner_Gang /= G
                        or else C.Buildings (O.Front).Block /= C.Buildings (B).Block)
            then
               Finish (S, C, Id, Line (F_No_Front));
            elsif Type_Class (O.Business) = Illegal
              and then S.Extra (O.Front).Hides /= No_Id and then S.Extra (O.Front).Hides /= B
            then
               Finish (S, C, Id, Line (F_Front_Taken));
            elsif not Spend (S, G, Type_Cost (O.Business)) then
               Finish (S, C, Id, Line (F_Fit_Out));
            else
               C.Buildings (B).Kind_Of := O.Business;
               S.City_Changed := True;
               if Type_Class (O.Business) = Illegal then
                  S.Extra (B).Front_Of := O.Front;
                  S.Extra (O.Front).Hides := B;
               end if;
               Assign_Manager (S, Slot, C, B, Actors, N);
               Say (O, Line (L_Opened, O.Business));
               Report (S, G, Line (M_Opened, O.Business));
            end if;

         when O_Run =>
            if not Has_B or else S.Extra (B).Owner_Gang /= G then
               Finish (S, C, Id, Line (F_Not_Your_Site));
            elsif not Has_Manager_Candidate (S, Slot, Actors, N) then
               Finish (S, C, Id, Line (F_No_Hood_Free, B));
            else
               declare
                  Old : constant Integer_32 := S.Extra (B).Manager;
               begin
                  if Old /= No_Id then
                     S.People (Old).Building := No_Id;
                     S.People (Old).X := Door_Of (S, C, B).X;
                     S.People (Old).Y := Door_Of (S, C, B).Y;
                     Send_Home (S, C, Old);
                     if S.Crews (Slot).Count < Max_Crew_Members then
                        Add_Member (S, Slot, Old);
                     else
                        Join_Pool (S, G, Old);
                     end if;
                     S.Extra (B).Manager := No_Id;
                  end if;
               end;
               Assign_Manager (S, Slot, C, B, Actors, N);
               Say (O, Line (L_New_Management, B));
            end if;

         when O_Collect =>
            if not Has_B or else S.Extra (B).Protect_Gang /= G then
               return;
            end if;
            declare
               Owner : constant Integer_32 := S.Extra (B).Owner_Person;
            begin
               if C.Standard and then Owner /= No_Id and then S.People (Owner).Status /= Dead
                 and then (Hostility_Of (S.People (Owner), G) - Fear_Of (S.People (Owner), G) + 256) / 2 >= 180
               then
                  --  (his hostility +16 toward other gangs is not kept; DESIGN 5)
                  Miss (Line (L_Refused_Pay, B, Owner));
                  Report (S, G, Line (M_Refused_Protection, B));
                  return;
               end if;
            end;
            if S.Extra (B).Collected_Week = S.Week then
               Miss (Line (L_Already_Paid, B));
               return;
            end if;
            Amount := S.Extra (B).Protect_Weekly;
            S.Extra (B).Collected_Week := S.Week;
            Cost := Declared (S, Slot, O, G, Amount);
            S.Gangs (G).Cash := S.Gangs (G).Cash + Cost;
            S.Gangs (G).Protection := S.Gangs (G).Protection + Cost;
            Say (O, Line (L_Collected, B, Amount));

         when O_Adjust =>
            if not Has_B or else S.Extra (B).Protect_Gang /= G then
               return;
            end if;
            Amount := (S.Extra (B).Protect_Base * Integer_32'Max (0, Integer_32'Min (200,
                         (if O.Level < 0 then 100 else O.Level))) + 50) / 100;
            S.Extra (B).Protect_Weekly := Amount;
            Say (O, Line (L_Protection_Set, B, Amount));

         when O_Donate =>
            if not Has_B or else not Type_Charity (C.Buildings (B).Kind_Of) then
               Finish (S, C, Id, Line (F_No_Charity));
               return;
            end if;
            Amount := (if O.Amount < 0 then Donation_Amount (C, B) else O.Amount);
            if Amount <= 0 then
               Finish (S, C, Id, Line (F_No_Donation));
            elsif not Spend (S, G, Amount) then
               Finish (S, C, Id, Line (F_Spare_Money));
            else
               Say (O, Line (L_Donated, B, Amount));
            end if;

         when O_Clean_Up =>
            if not Has_B then
               return;
            end if;
            if not Spend (S, G, Cleanup_Cost) then
               Finish (S, C, Id, Line (F_Clean_Up_Money));
               return;
            end if;
            declare
               R : constant Integer_32 := Root_Block (C, C.Buildings (B).Block);
            begin
               C.Blocks (R).Squalor := Integer_32'Max (0, C.Blocks (R).Squalor - 1);
               S.City_Changed := True;
            end;
            Say (O, Line (L_Cleaned_Up, B));

         when O_Clear_Streets =>
            if not Has_B then
               return;
            end if;
            --  Nobody is bribed before item 8.
            Finish (S, C, Id, Line (F_Streets_Not_Bribed));

         when O_Explore =>
            if not Has_B then
               return;
            end if;
            declare
               Hidden : constant Integer_32 := S.Extra (B).Hides;
            begin
               if Hidden /= No_Id and then Live (C, Hidden) and then S.Extra (Hidden).Owner_Gang /= G then
                  Roll (S, Main, O.Kind, Actors, N,
                        3_500 + 40 * Integer_64 (Type_Office_Cover (C.Buildings (B).Kind_Of)), 10_000, Found);
                  if Found then
                     Say (O, Line (L_Found_Hidden, B, Hidden));
                     Report (S, G, Line (M_Uncovered, 0, Hidden));
                  end if;
               end if;
            end;
            Say (O, Line (L_Looked_Over, B, Integer_32 (S.Extra (B).Owner_Gang),
                          (if S.Extra (B).Owner_Gang = 0 then Integer_32 (S.Extra (B).Protect_Gang) else 0),
                          S.Extra (B).Protect_Weekly));

         when O_Recruit =>
            if not Has_B or else Type_Recruit_As (C.Buildings (B).Kind_Of) /= Role'Pos (R_Hood) then
               return;  --  specialists are item 8
            end if;
            declare
               Cand  : Assigned_List := [others => No_Id];
               Cn    : Integer_32 := 0;
               Total : Integer_32 := 0;
               Take  : Integer_32 := 1;
               Else_B : Integer_32 := No_Id;
               Else_D, D : Long_Float := 0.0;
               Joined : Boolean;
               function Seeking (P, At_B : Integer_32) return Boolean is
                 (S.People (P).Gang = 0 and then S.People (P).Status = Active
                  and then S.People (P).Building = At_B and then S.People (P).Kind = R_Hood);
            begin
               for P in Integer_32 range 0 .. S.Count - 1 loop
                  if Seeking (P, B) then
                     Total := Total + 1;
                     if Cn < 3 then
                        Cn := Cn + 1;
                        Cand (Integer (Cn)) := P;
                     end if;
                  end if;
               end loop;
               if Total = 0 then
                  for Other in Integer_32 range 0 .. C.Building_Count - 1 loop
                     if Other /= B and then Live (C, Other)
                       and then Type_Recruit_As (C.Buildings (Other).Kind_Of) = Role'Pos (R_Hood)
                     then
                        D := Dist (Centre (C, Other), Centre (C, B));
                        if Else_B = No_Id or else D < Else_D then
                           for P in Integer_32 range 0 .. S.Count - 1 loop
                              if Seeking (P, Other) then
                                 Else_B := Other;
                                 Else_D := D;
                                 exit;
                              end if;
                           end loop;
                        end if;
                     end if;
                  end loop;
                  Say (O, Line (L_Nobody_Hiring, B, Else_B));
                  Report (S, G, Line (L_Nobody_Hiring, B, Else_B));
                  return;
               end if;
               Roll (S, Main, O.Kind, Actors, N, 1, 4, Found);
               if Found then
                  Int (S, Main, 1, Integer_32'Min (3, Total), Take);
               end if;
               for K in 1 .. Integer (Take) loop
                  Take_On_Hood (S, C, G, Slot, Cand (K), S.Gangs (G).Player, Joined);
               end loop;
               Say (O, Line (L_Signed_On, 0, Take));
            end;

         when O_Guard | O_Patrol | O_Go_To =>
            null;
      end case;
   end Resolve;

   function Work_For (S : Population_State; O : Order_Rec; Actors : Assigned_List; N : Integer_32)
     return Integer_64
   is
      F : constant Fraction := Actor_Factor (S, O.Kind, Actors, N);
      W : constant Integer_64 :=
        Integer_64 (Defs (O.Kind).Minutes) * (1_350_000 * F.Den - 500_000 * F.Num) / F.Den;
   begin
      return Integer_64'Max (20 * Work_Scale, W);
   end Work_For;

   ---------------------------------------------------------------------
   --  The minute (tickOrders, tickStandingOrder)
   ---------------------------------------------------------------------

   procedure Actors_Of (S : Population_State; Id : Integer_32; List : out Assigned_List; N : out Integer_32) is
      O : Order_Rec renames S.Orders (Id);
      P : Integer_32;
   begin
      List := [others => No_Id];
      N := 0;
      for K in 1 .. Integer (O.Assigned_Count) loop
         P := O.Assigned (K);
         if P /= No_Id and then S.People (P).Order = Id and then S.People (P).Status = Active then
            N := N + 1;
            List (Integer (N)) := P;
         end if;
      end loop;
   end Actors_Of;

   procedure Standing
     (S : in out Population_State; C : Hood.City.City_State; Main : in out Hood.Random.Mulberry;
      Id : Integer_32; Actors : Assigned_List; N : Integer_32)
   is
      O : Order_Rec renames S.Orders (Id);
      Arrived, Hit : Boolean;
      pragma Unreferenced (Arrived);
      Blk, Count, Spot : Integer_32;
      X, Y : Long_Float;
   begin
      case O.Kind is
         when O_Patrol =>
            for K in 1 .. Integer (N) loop
               if not S.People (Actors (K)).Walking then
                  O.Cursor := O.Cursor + 1;
                  Count := Standing_Block_Count (C, O, O.Cursor, Blk);
                  if Count > 0 then
                     Int (S, Main, 0, 100_000, Spot);
                     Pavement (C.Blocks (Blk), Spot, X, Y);
                     Set_Dest (S, C, Actors (K), (X, Y, True));
                  end if;
               else
                  Arrived := Step (S, C, Actors (K));
               end if;
            end loop;
            --  Visible protection reassures the neighbourhood (heat and
            --  opinion are items 7-8; the draw is kept).
            Chance (S, Main, 4, 1_000, Hit);
         when O_Guard =>
            declare
               B : constant Integer_32 := (if O.Target_Count > 0 then O.Targets (1) else No_Id);
            begin
               if B = No_Id or else not Live (C, B) or else S.Extra (B).Owner_Gang /= O.Gang then
                  Finish (S, C, Id, Line (F_Site_Gone));
                  return;
               end if;
               for K in 1 .. Integer (N) loop
                  --  The car stops on the road beside the shop; the guard
                  --  walks the rest of the way to the door.
                  if S.People (Actors (K)).In_Vehicle then
                     Transport.Dismount (S, Actors (K));
                     Clear_Dest (S, Actors (K));
                  end if;
                  if Dist (Person_Pos (S, Actors (K)), Door_Of (S, C, B)) > 5.0 then
                     if not S.People (Actors (K)).Walking then
                        Set_Dest (S, C, Actors (K), Door_Of (S, C, B));
                     end if;
                     Arrived := Step (S, C, Actors (K));
                  end if;
               end loop;
            end;
         when O_Go_To =>
            for K in 1 .. Integer (N) loop
               if S.People (Actors (K)).Walking then
                  Arrived := Step (S, C, Actors (K));
               end if;
            end loop;
         when others =>
            null;
      end case;
   end Standing;

   procedure Tick
     (S    : in out Population_State;
      C    : in out Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
   is
      List  : Crew_Slots_All;
      Ncrew : Integer_32;
      Slot, Id : Integer_32;
      Freed, Any_Queued : Boolean;
      Ok : Boolean;
      pragma Unreferenced (Ok);
      Actors : Assigned_List;
      N, Arrived : Integer_32;
      Tp : Pos;
      Missed : Line_Rec;
   begin
      Transport.Reconcile (S, C);
      Crews_By_Number (S, List, Ncrew);
      for Ck in 1 .. Integer (Ncrew) loop
         Slot := List (Ck);
         Freed := False;
         for J in 1 .. Integer (S.Crews (Slot).Order_Count) loop
            Id := S.Crews (Slot).Orders (J);
            declare
               O : Order_Rec renames S.Orders (Id);
               D : Def_Rec renames Defs (O.Kind);
            begin
               if O.State in Travelling | Waiting | Executing then
                  Actors_Of (S, Id, Actors, N);
                  if N = 0 then
                     Finish (S, C, Id, (if O.Fail.Kind /= L_None then O.Fail else Line (F_Nobody_Left)));
                     Freed := True;
                  else
                     if N < (if O.Crew_Size >= 0 then O.Crew_Size else O.Manpower) then
                        Say (O, Line (L_Continuing, Order_Kind'Pos (O.Kind), N,
                                      (if O.Crew_Size >= 0 then O.Crew_Size else O.Manpower)));
                        Report (S, O.Gang, Line (L_Continuing, Order_Kind'Pos (O.Kind), N,
                                                 (if O.Crew_Size >= 0 then O.Crew_Size else O.Manpower)));
                     end if;
                     O.Crew_Size := N;
                     if O.State = Travelling then
                        Tp := Target_Pos (S, C, O);
                        if not Tp.Has then
                           Finish (S, C, Id, Line (F_Target_Lost));
                           Freed := True;
                        else
                           Arrived := 0;
                           for K in 1 .. Integer (N) loop
                              declare
                                 A : constant Integer_32 := Actors (K);
                                 Boarding : constant Boolean :=
                                   S.People (A).Vehicle /= No_Id
                                   and then S.Fleet (S.People (A).Vehicle).Boarding;
                              begin
                                 if not Boarding and then not S.People (A).Walking
                                   and then Dist (Person_Pos (S, A), Tp) > 6.0
                                 then
                                    Set_Dest (S, C, A, Tp);
                                 end if;
                                 if Step (S, C, A)
                                   or else (not Boarding and then not S.People (A).In_Vehicle
                                            and then Dist (Person_Pos (S, A), Tp) <= 6.0)
                                 then
                                    Arrived := Arrived + 1;
                                 end if;
                              end;
                           end loop;
                           if Arrived = N then
                              if not D.Whole_Week then
                                 for K in 1 .. Integer (N) loop
                                    if not S.People (Actors (K)).In_Vehicle
                                      and then S.People (Actors (K)).Walking
                                    then
                                       Clear_Dest (S, Actors (K));
                                    end if;
                                 end loop;
                              end if;
                              O.Work_Left := Work_For (S, O, Actors, N);
                              O.State := Executing;
                           end if;
                        end if;
                     elsif O.State = Executing then
                        if D.Whole_Week then
                           if O.Worked >= 0 then
                              O.Worked := Integer_32'Min (Minutes_Per_Week, O.Worked + 1);
                           end if;
                           Standing (S, C, Main, Id, Actors, N);
                        else
                           O.Work_Left := O.Work_Left - Integer_64 (N) * Work_Scale;
                           if O.Work_Left <= 0 then
                              Resolve (S, C, Main, Slot, Id, Actors, N, Missed);
                              if O.State /= Failed and then Missed.Kind = L_None then
                                 O.Completed := O.Completed + 1;
                              end if;
                              if Missed.Kind /= L_None then
                                 O.Last_Miss := Missed;
                              end if;
                              O.Cursor := O.Cursor + 1;
                              if D.Target = On_Area and then O.Cursor < O.Target_Count
                                and then O.State = Executing
                              then
                                 O.State := Travelling;
                                 Tp := Target_Pos (S, C, O);
                                 if Tp.Has then
                                    for K in 1 .. Integer (N) loop
                                       Set_Dest (S, C, Actors (K), Tp);
                                    end loop;
                                 end if;
                              elsif O.State = Executing then
                                 Finish (S, C, Id,
                                         (if O.Completed > 0 then No_Line
                                          elsif O.Last_Miss.Kind /= L_None then O.Last_Miss
                                          else Line (F_Nothing_Came)));
                                 Freed := True;
                              else
                                 Freed := True;
                              end if;
                           end if;
                        end if;
                     end if;
                  end if;
               end if;
            end;
         end loop;
         Any_Queued := False;
         for J in 1 .. Integer (S.Crews (Slot).Order_Count) loop
            Any_Queued := Any_Queued or else S.Orders (S.Crews (Slot).Orders (J)).State = Queued;
         end loop;
         if Freed or else Any_Queued then
            for J in 1 .. Integer (S.Crews (Slot).Order_Count) loop
               Id := S.Crews (Slot).Orders (J);
               if S.Orders (Id).State = Queued then
                  Ok := Assign (S, C, Slot, Id, False);
               end if;
            end loop;
         end if;
      end loop;
   end Tick;

   ---------------------------------------------------------------------
   --  The week's end (failUnfinishedOrders, rolloverOrders)
   ---------------------------------------------------------------------

   procedure Fail_Unfinished (S : in out Population_State; C : Hood.City.City_State) is
      Never, Duty : Boolean;
      Blk, Blocks : Integer_32;
      P : Integer_32;
   begin
      for Id in S.Orders'Range loop
         declare
            O : Order_Rec renames S.Orders (Id);
         begin
            if O.Gang /= 0 and then O.State in Queued | Travelling | Waiting | Executing then
               Never := O.State = Queued;
               Duty := (if O.Worked >= 0 then O.Worked > 0 else O.State = Executing);
               if Defs (O.Kind).Whole_Week and then not Never and then Duty then
                  O.State := Done;
                  case O.Kind is
                     when O_Guard =>
                        Say (O, Line (L_Stood_Guard, (if O.Target_Count > 0 then O.Targets (1) else No_Id),
                                      Integer_32'Max (0, O.Worked)));
                     when O_Patrol =>
                        Blocks := Integer_32'Max (1, Standing_Block_Count (C, O, 0, Blk));
                        Say (O, Line (L_Patrolled, 0, Blocks, Integer_32'Max (0, O.Worked)));
                     when others =>
                        Say (O, Line (L_Held, 0, Integer_32'Max (0, O.Worked)));
                  end case;
               elsif O.Completed > 0 then
                  O.State := Done;
                  O.Fail := Line (L_Ran_Out);
               else
                  O.State := Failed;
                  if O.Fail.Kind = L_None then
                     if Never then
                        O.Fail := (if O.Waiting_For.Kind /= L_None
                                   then Line (F_Never_Started, Line_Kind'Pos (O.Waiting_For.Kind),
                                              O.Waiting_For.A, O.Waiting_For.B, O.Waiting_For.C)
                                   else Line (F_Never_Started_Default));
                     else
                        O.Fail := Line (F_Not_Enough_Time);
                     end if;
                  end if;
               end if;
               O.Waiting_For := No_Line;
               if not Never then
                  O.Finished := Minutes_Per_Week;
               end if;
               for K in 1 .. Integer (O.Assigned_Count) loop
                  P := O.Assigned (K);
                  if P /= No_Id and then S.People (P).Order = Id then
                     S.People (P).Order := No_Id;
                  end if;
               end loop;
            end if;
         end;
      end loop;
   end Fail_Unfinished;

   procedure Rollover (S : in out Population_State; C : Hood.City.City_State) is
      Keep  : Crew_Order_List;
      Kn    : Integer;
      Done_Ids : array (1 .. Max_Orders) of Integer_32 := [others => No_Id];
      Dn    : Integer := 0;
      J     : Integer;
      V     : Integer_32;
   begin
      --  Last week's finished orders, copied in number order.
      for Id in S.Orders'Range loop
         if S.Orders (Id).Gang /= 0 and then S.Orders (Id).State in Done | Failed then
            V := Id;
            J := Dn;
            while J >= 1 and then S.Orders (Done_Ids (J)).Id > S.Orders (V).Id loop
               Done_Ids (J + 1) := Done_Ids (J);
               J := J - 1;
            end loop;
            Done_Ids (J + 1) := V;
            Dn := Dn + 1;
         end if;
      end loop;
      S.Last_Count := Integer_32 (Dn);
      for K in 1 .. Dn loop
         S.Last_Week (Integer_32 (K) - 1) := S.Orders (Done_Ids (K));
      end loop;
      for Slot in S.Crews'Range loop
         if S.Crews (Slot).Gang /= 0 then
            S.Crews (Slot).Time_Used := 0;
            Keep := [others => No_Id];
            Kn := 0;
            for K in 1 .. Integer (S.Crews (Slot).Order_Count) loop
               declare
                  Id : constant Integer_32 := S.Crews (Slot).Orders (K);
                  O  : Order_Rec renames S.Orders (Id);
               begin
                  if O.Repeat and then Defs (O.Kind).Repeatable and then O.State /= Cancelled then
                     O.State := Queued;
                     O.Cursor := 0;
                     O.Completed := 0;
                     O.Result_Count := 0;
                     O.Results := [others => No_Line];
                     O.Fail := No_Line;
                     O.Last_Miss := No_Line;
                     O.Assigned_Count := 0;
                     O.Assigned := [others => No_Id];
                     O.Waiting_For := No_Line;
                     O.Crew_Size := -1;
                     O.Worked := -1;
                     O.Finished := -1;
                     O.Started := -1;
                     if O.Kind = O_Collect and then O.Block_Count > 0 then
                        declare
                           In2 : Order_Input := No_Input;
                           In_Block : Boolean;
                        begin
                           In2.Kind := O.Kind;
                           In2.Crew := Slot;
                           In2.Block_Count := O.Block_Count;
                           In2.Blocks := O.Blocks;
                           for T in 1 .. Integer (O.Target_Count) loop
                              In_Block := False;
                              for Bk in 1 .. Integer (O.Block_Count) loop
                                 In_Block := In_Block or else C.Buildings (O.Targets (T)).Block = O.Blocks (Bk);
                              end loop;
                              if not In_Block then
                                 In2.Picked_Count := In2.Picked_Count + 1;
                                 In2.Picked (Integer (In2.Picked_Count)) := O.Targets (T);
                              end if;
                           end loop;
                           Expand (S, C, O.Gang, In2, O.Targets, O.Target_Count);
                        end;
                     end if;
                     O.Estimate := Estimate (S, C, Slot, O, Id);
                     Kn := Kn + 1;
                     Keep (Kn) := Id;
                  else
                     O.Gang := 0;
                  end if;
               end;
            end loop;
            S.Crews (Slot).Orders := Keep;
            S.Crews (Slot).Order_Count := Integer_32 (Kn);
            Sync_Time (S, C, Slot);
         end if;
      end loop;
   end Rollover;

end Hood.Population.Orders;
